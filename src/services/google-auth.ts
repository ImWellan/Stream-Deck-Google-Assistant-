import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

import { OAuth2Client, type Credentials } from "google-auth-library";
import GoogleAssistantModule from "google-assistant";
import open from "open";

const require = createRequire(import.meta.url);
const keytar = require("keytar") as typeof import("keytar");
const GoogleAssistant = GoogleAssistantModule as unknown as GoogleAssistantConstructor;

const KEYTAR_SERVICE = "com.codex-demo.google-text-commands";
const ACCOUNTS_INDEX = "google-accounts-index";
const ACCOUNT_PREFIX = "google-account:";
const ASSISTANT_SCOPE = "https://www.googleapis.com/auth/assistant-sdk-prototype";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;

type GoogleClient = {
	client_id: string;
	client_secret?: string;
	redirect_uris?: string[];
};

type GoogleClientFile = {
	installed?: GoogleClient;
	web?: GoogleClient;
};

type AssistantConversation = {
	on(event: string, listener: (...args: any[]) => void): AssistantConversation;
};

type AssistantInstance = {
	on(event: string, listener: (...args: any[]) => void): AssistantInstance;
	once(event: string, listener: (...args: any[]) => void): AssistantInstance;
	start(options: Record<string, unknown>): AssistantConversation;
};

type GoogleAssistantConstructor = new (options: {
	oauth2Client: OAuth2Client;
}) => AssistantInstance;

type AccountRecord = {
	id: string;
	email: string;
};

type AccountsIndex = {
	accounts: AccountRecord[];
	currentAccountId?: string;
};

export type AuthStatus = {
	connected: boolean;
	message: string;
	accounts: AccountRecord[];
	currentAccountId?: string;
	currentEmail?: string;
};

export type AssistantRequestOptions = {
	language?: string;
	deviceModelId?: string;
	deviceId?: string;
	latitude?: number;
	longitude?: number;
};

export type AssistantResponse = {
	text?: string;
	deviceAction?: unknown;
};

/**
 * Google authentication and Assistant transport.
 *
 * Refresh tokens are intentionally kept out of Stream Deck settings and are
 * stored in the operating system credential vault through keytar instead.
 */
export class GoogleAuthService {
	private oauthClient?: OAuth2Client;
	private storedTokens?: Credentials;
	private loginPromise?: Promise<AuthStatus>;
	private assistantPromise?: Promise<AssistantInstance>;
	private accounts: AccountRecord[] = [];
	private currentAccountId?: string;
	private accountsLoaded = false;

	async getStatus(): Promise<AuthStatus> {
		await this.loadAccounts();
		try {
			await this.readClientFile();
		} catch (error) {
			return this.makeStatus(error instanceof Error ? error.message : "Configuration Google incomplète.", false);
		}

		const current = this.accounts.find((account) => account.id === this.currentAccountId);
		return this.makeStatus(
			this.storedTokens?.refresh_token && current
				? `Compte Google actif : ${current.email}.`
				: this.accounts.length
					? "Sélectionne un compte Google ou ajoute un nouveau compte."
					: "Aucun compte Google connecté.",
			Boolean(this.storedTokens?.refresh_token && current)
		);
	}

	async connect(): Promise<AuthStatus> {
		if (this.loginPromise) return this.loginPromise;
		this.loginPromise = this.performLogin().finally(() => {
			this.loginPromise = undefined;
		});
		return this.loginPromise;
	}

	async selectAccount(accountId: string): Promise<AuthStatus> {
		await this.loadAccounts();
		if (!this.accounts.some((account) => account.id === accountId)) throw new Error("Ce compte Google n’existe plus.");
		this.currentAccountId = accountId;
		this.storedTokens = undefined;
		this.oauthClient = undefined;
		this.assistantPromise = undefined;
		await this.loadCurrentTokens();
		await this.persistAccountsIndex();
		return this.getStatus();
	}

	async disconnect(accountId = this.currentAccountId): Promise<AuthStatus> {
		await this.loadAccounts();
		if (accountId) await keytar.deletePassword(KEYTAR_SERVICE, `${ACCOUNT_PREFIX}${accountId}`);
		this.accounts = this.accounts.filter((account) => account.id !== accountId);
		if (this.currentAccountId === accountId) this.currentAccountId = this.accounts[0]?.id;
		this.storedTokens = undefined;
		this.oauthClient = undefined;
		this.assistantPromise = undefined;
		await this.loadCurrentTokens();
		await this.persistAccountsIndex();
		return this.getStatus();
	}

	async sendText(text: string, options: AssistantRequestOptions = {}): Promise<AssistantResponse> {
		const command = text.trim();
		if (!command) throw new Error("La commande Google est vide.");

		const client = await this.getAuthenticatedClient();
		const assistant = await this.getAssistant(client);

		return new Promise<AssistantResponse>((resolve, reject) => {
			let responseText: string | undefined;
			let deviceAction: unknown;
			let finished = false;
			const timeout = setTimeout(() => finish(new Error("Google Assistant n’a pas répondu dans le délai prévu.")), REQUEST_TIMEOUT_MS);

			const finish = (error?: Error) => {
				if (finished) return;
				finished = true;
				clearTimeout(timeout);
				if (error) reject(this.decorateAssistantError(error));
				else resolve({ text: responseText, deviceAction });
			};

			try {
				const conversation = assistant.start({
					textQuery: command,
					isNew: true,
					lang: options.language || "fr-CA",
					deviceModelId: options.deviceModelId || "example",
					deviceId: options.deviceId || "example",
					deviceLocation: options.latitude !== undefined && options.longitude !== undefined
						? { coordinates: { latitude: options.latitude, longitude: options.longitude } }
						: undefined,
					screen: { isOn: false }
				});

				conversation.on("response", (textResponse: string) => {
					responseText = textResponse || responseText;
				});
				conversation.on("device-action", (action: unknown) => {
					deviceAction = action;
				});
				conversation.on("error", (error: Error) => finish(error));
				conversation.on("ended", (error?: Error) => finish(error));
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private async performLogin(): Promise<AuthStatus> {
		await this.loadAccounts();
		const clientConfig = await this.readClientFile();
		const state = randomBytes(32).toString("hex");
		const server = createServer();

		try {
			const { redirectUri, callback } = await this.startCallbackServer(server, state);
			const client = new OAuth2Client(clientConfig.client_id, clientConfig.client_secret, redirectUri);
			const authUrl = client.generateAuthUrl({
				access_type: "offline",
				prompt: "consent",
				include_granted_scopes: true,
				scope: [ASSISTANT_SCOPE, "openid", "email", "profile"],
				state
			});

			await open(authUrl);
			const code = await callback;
			const { tokens } = await client.getToken(code);
			if (!tokens.refresh_token) throw new Error("Google n’a pas fourni de jeton de rafraîchissement. Relance la connexion et accepte toutes les autorisations.");

			client.setCredentials(tokens);
			const email = await this.readEmail(client);
			const existing = this.accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
			const account = existing || { id: randomBytes(16).toString("hex"), email };
			if (!existing) this.accounts.push(account);
			else existing.email = email;

			this.currentAccountId = account.id;
			this.storedTokens = client.credentials;
			this.attachTokenPersistence(client, account.id);
			this.oauthClient = client;
			this.assistantPromise = undefined;
			await this.persistAccountTokens(account.id, client.credentials);
			await this.persistAccountsIndex();
			return this.makeStatus(`Compte Google connecté : ${email}.`, true);
		} finally {
			if (server.listening) server.close();
		}
	}

	private async startCallbackServer(server: ReturnType<typeof createServer>, expectedState: string): Promise<{
		redirectUri: string;
		callback: Promise<string>;
	}> {
		const callback = new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("La connexion Google a expiré.")), AUTH_TIMEOUT_MS);
			server.on("request", (request, response) => {
				const requestUrl = new URL(request.url || "/", "http://localhost");
				if (requestUrl.pathname !== "/oauth2callback") {
					response.writeHead(404).end();
					return;
				}

				const error = requestUrl.searchParams.get("error");
				const state = requestUrl.searchParams.get("state");
				const code = requestUrl.searchParams.get("code");
				if (error) {
					response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end("Connexion annulée. Vous pouvez fermer cette fenêtre.");
					clearTimeout(timer);
					reject(new Error(`Connexion Google annulée : ${error}`));
					return;
				}
				if (state !== expectedState || !code) {
					response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end("Réponse OAuth invalide. Vous pouvez fermer cette fenêtre.");
					clearTimeout(timer);
					reject(new Error("Réponse OAuth Google invalide."));
					return;
				}

				response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("Compte connecté. Vous pouvez fermer cette fenêtre.");
				clearTimeout(timer);
				resolve(code);
			});
		});

		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => resolve());
		});

		const address = server.address() as AddressInfo;
		return {
			redirectUri: `http://localhost:${address.port}/oauth2callback`,
			callback
		};
	}

	private async getAuthenticatedClient(): Promise<OAuth2Client> {
		const client = await this.getOAuthClient();
		if (!this.currentAccountId || !this.storedTokens?.refresh_token) {
			throw new Error("Connecte ou sélectionne d’abord un compte Google dans les réglages du plugin.");
		}

		try {
			await client.getAccessToken();
			return client;
		} catch (error) {
			if (this.isRevokedTokenError(error)) {
				await this.disconnect(this.currentAccountId);
				throw new Error("La connexion Google a été révoquée. Reconnecte le compte dans les réglages du plugin.");
			}
			throw error;
		}
	}

	private async getOAuthClient(): Promise<OAuth2Client> {
		if (this.oauthClient) return this.oauthClient;
		await this.readClientFile();
		await this.loadAccounts();
		if (!this.currentAccountId || !this.storedTokens) throw new Error("Aucun compte Google sélectionné.");
		const config = await this.readClientFile();
		const client = new OAuth2Client(config.client_id, config.client_secret);
		client.setCredentials(this.storedTokens);
		this.attachTokenPersistence(client, this.currentAccountId);
		this.oauthClient = client;
		return client;
	}

	private attachTokenPersistence(client: OAuth2Client, accountId: string): void {
		client.on("tokens", (tokens) => {
			void this.persistAccountTokens(accountId, { ...client.credentials, ...tokens });
		});
	}

	private async getAssistant(client: OAuth2Client): Promise<AssistantInstance> {
		if (!this.assistantPromise) {
			this.assistantPromise = new Promise<AssistantInstance>((resolve, reject) => {
				const assistant = new GoogleAssistant({ oauth2Client: client });
				assistant.once("ready", () => resolve(assistant));
				assistant.once("error", reject);
			});
		}
		return this.assistantPromise;
	}

	private async readEmail(client: OAuth2Client): Promise<string> {
		const token = (await client.getAccessToken()).token;
		if (!token) throw new Error("Google n’a pas fourni de jeton d’accès.");
		const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!response.ok) throw new Error("Impossible de récupérer l’adresse courriel du compte Google.");
		const profile = await response.json() as { email?: string };
		if (!profile.email) throw new Error("Google n’a pas retourné l’adresse courriel du compte.");
		return profile.email;
	}

	private async readClientFile(): Promise<GoogleClient> {
		const configuredPath = process.env.GOOGLE_ASSISTANT_CLIENT_FILE;
		const clientPath = configuredPath || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "google-oauth.json");
		let parsed: GoogleClientFile;
		try {
			parsed = JSON.parse(await readFile(clientPath, "utf8")) as GoogleClientFile;
		} catch {
			throw new Error(`Ajoute le fichier google-oauth.json dans le dossier du plugin (${clientPath}).`);
		}

		const client = parsed.installed || parsed.web;
		if (!client?.client_id) throw new Error("Le fichier Google OAuth ne contient pas de client_id.");
		return client;
	}

	private async loadAccounts(): Promise<void> {
		if (this.accountsLoaded) return;
		const serialized = await keytar.getPassword(KEYTAR_SERVICE, ACCOUNTS_INDEX);
		if (serialized) {
			try {
				const index = JSON.parse(serialized) as AccountsIndex;
				this.accounts = Array.isArray(index.accounts) ? index.accounts.filter((account) => account?.id && account?.email) : [];
				this.currentAccountId = index.currentAccountId;
			} catch {
				this.accounts = [];
				this.currentAccountId = undefined;
			}
		}
		if (!this.currentAccountId || !this.accounts.some((account) => account.id === this.currentAccountId)) this.currentAccountId = this.accounts[0]?.id;
		this.accountsLoaded = true;
		await this.loadCurrentTokens();
	}

	private async loadCurrentTokens(): Promise<void> {
		this.storedTokens = undefined;
		if (!this.currentAccountId) return;
		const serialized = await keytar.getPassword(KEYTAR_SERVICE, `${ACCOUNT_PREFIX}${this.currentAccountId}`);
		if (!serialized) return;
		try {
			this.storedTokens = JSON.parse(serialized) as Credentials;
		} catch {
			await keytar.deletePassword(KEYTAR_SERVICE, `${ACCOUNT_PREFIX}${this.currentAccountId}`);
		}
	}

	private async persistAccountTokens(accountId: string, tokens: Credentials): Promise<void> {
		await keytar.setPassword(KEYTAR_SERVICE, `${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(tokens));
		if (accountId === this.currentAccountId) this.storedTokens = tokens;
	}

	private async persistAccountsIndex(): Promise<void> {
		await keytar.setPassword(KEYTAR_SERVICE, ACCOUNTS_INDEX, JSON.stringify({ accounts: this.accounts, currentAccountId: this.currentAccountId } satisfies AccountsIndex));
	}

	private makeStatus(message: string, connected: boolean): AuthStatus {
		const current = this.accounts.find((account) => account.id === this.currentAccountId);
		return {
			connected,
			message,
			accounts: this.accounts,
			currentAccountId: this.currentAccountId,
			currentEmail: current?.email
		};
	}

	private isRevokedTokenError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return /invalid_grant|invalid credentials|unauthenticated/i.test(message);
	}

	private decorateAssistantError(error: Error): Error {
		if (this.isRevokedTokenError(error)) return new Error("Google a refusé le jeton. Reconnecte le compte dans les réglages du plugin.");
		return error;
	}
}
