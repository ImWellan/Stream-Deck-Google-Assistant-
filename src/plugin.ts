import streamDeck from "@elgato/streamdeck";

import { GoogleCommandAction } from "./actions/google-command";
import { CommandRunner } from "./services/command-runner";
import { GoogleAuthService } from "./services/google-auth";

const auth = new GoogleAuthService();
const runner = new CommandRunner();

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new GoogleCommandAction(auth, runner));

streamDeck.ui.onSendToPlugin(async (ev) => {
	const message = ev.payload as { event?: string; accountId?: string } | null;
	if (!message?.event) return;

	try {
		switch (message.event) {
			case "get-auth-status":
				await streamDeck.ui.sendToPropertyInspector({ type: "auth-status", ...(await auth.getStatus()) });
				break;
			case "start-auth":
				await streamDeck.ui.sendToPropertyInspector({ type: "auth-status", connected: false, message: "Fenêtre Google ouverte…" });
				await streamDeck.ui.sendToPropertyInspector({ type: "auth-status", ...(await auth.connect()) });
				break;
			case "select-account":
				if (!message.accountId) throw new Error("Compte Google non spécifié.");
				await streamDeck.ui.sendToPropertyInspector({ type: "auth-status", ...(await auth.selectAccount(message.accountId)) });
				break;
			case "disconnect-account":
				await auth.disconnect(message.accountId);
				await streamDeck.ui.sendToPropertyInspector({ type: "auth-status", ...(await auth.getStatus()) });
				break;
		}
	} catch (error) {
		await streamDeck.ui.sendToPropertyInspector({
			type: "auth-status",
			connected: false,
			message: error instanceof Error ? error.message : String(error)
		});
	}
});

void auth.getStatus().catch(() => undefined);
streamDeck.connect();
