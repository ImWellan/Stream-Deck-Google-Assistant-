import { action, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";

import { CommandRunner, normalizeSteps, type SequenceStep } from "../services/command-runner";
import type { GoogleAuthService } from "../services/google-auth";

export type SecondaryPressType = "long" | "double";

export type GoogleCommandSettings = {
	simpleClickSteps?: SequenceStep[];
	secondaryEnabled?: boolean;
	secondaryType?: SecondaryPressType;
	secondarySteps?: SequenceStep[];
	language?: string;
	deviceModelId?: string;
	deviceId?: string;
	latitude?: string;
	longitude?: string;
	label?: string;
	// Kept for profiles created by the first prototype.
	command?: string;
	sequence?: string;
};

type PressState = {
	isDown: boolean;
	longTriggered: boolean;
	holdTimer?: ReturnType<typeof setTimeout>;
	doubleTimer?: ReturnType<typeof setTimeout>;
};

const LONG_PRESS_MS = 700;
const DOUBLE_CLICK_MS = 350;

@action({ UUID: "com.codex-demo.google-text-commands.command" })
export class GoogleCommandAction extends SingletonAction<GoogleCommandSettings> {
	private readonly pressStates = new Map<string, PressState>();

	constructor(private readonly auth: GoogleAuthService, private readonly runner: CommandRunner) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent<GoogleCommandSettings>): void | Promise<void> {
		return ev.action.setTitle(ev.payload.settings.label?.trim() || "Google");
	}

	override onKeyDown(ev: KeyDownEvent<GoogleCommandSettings>): void | Promise<void> {
		const settings = ev.payload.settings;
		if (!settings.secondaryEnabled) {
			void this.execute(ev.action, this.getSteps(settings, "simple"), settings);
			return;
		}

		const id = ev.action.id;
		const current = this.pressStates.get(id);
		if (settings.secondaryType === "double") {
			this.pressStates.set(id, { isDown: true, longTriggered: false, doubleTimer: current?.doubleTimer });
			return;
		}

		const state: PressState = { isDown: true, longTriggered: false };
		state.holdTimer = setTimeout(() => {
			state.longTriggered = true;
			void this.execute(ev.action, this.getSteps(settings, "secondary"), settings);
		}, LONG_PRESS_MS);
		this.pressStates.set(id, state);
	}

	override onKeyUp(ev: KeyUpEvent<GoogleCommandSettings>): void | Promise<void> {
		const settings = ev.payload.settings;
		if (!settings.secondaryEnabled) return;

		const id = ev.action.id;
		const state = this.pressStates.get(id);
		if (!state) return;

		if (settings.secondaryType === "long") {
			if (state.holdTimer) clearTimeout(state.holdTimer);
			this.pressStates.delete(id);
			if (!state.longTriggered) void this.execute(ev.action, this.getSteps(settings, "simple"), settings);
			return;
		}

		if (state.doubleTimer) {
			clearTimeout(state.doubleTimer);
			this.pressStates.delete(id);
			void this.execute(ev.action, this.getSteps(settings, "secondary"), settings);
			return;
		}

		state.doubleTimer = setTimeout(() => {
			this.pressStates.delete(id);
			void this.execute(ev.action, this.getSteps(settings, "simple"), settings);
		}, DOUBLE_CLICK_MS);
		state.isDown = false;
		this.pressStates.set(id, state);
	}

	private getSteps(settings: GoogleCommandSettings, section: "simple" | "secondary"): SequenceStep[] {
		if (section === "secondary") return normalizeSteps(settings.secondarySteps);
		return normalizeSteps(settings.simpleClickSteps, settings.sequence, settings.command);
	}

	private async execute(actionInstance: Parameters<NonNullable<GoogleCommandAction["onKeyDown"]>>[0]["action"], steps: SequenceStep[], settings: GoogleCommandSettings): Promise<void> {
		try {
			await actionInstance.setTitle("...");
			await this.runner.run(steps, this.auth, {
				language: settings.language || "fr-CA",
				deviceModelId: settings.deviceModelId,
				deviceId: settings.deviceId,
				latitude: this.parseCoordinate(settings.latitude),
				longitude: this.parseCoordinate(settings.longitude)
			});
			await actionInstance.showOk();
		} catch (error) {
			await actionInstance.showAlert();
			console.error("Google command failed", error);
		} finally {
			await actionInstance.setTitle(settings.label?.trim() || "Google");
		}
	}

	private parseCoordinate(value: string | undefined): number | undefined {
		if (!value?.trim()) return undefined;
		const number = Number(value);
		return Number.isFinite(number) ? number : undefined;
	}
}
