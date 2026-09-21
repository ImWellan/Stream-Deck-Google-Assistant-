import type { AssistantRequestOptions, GoogleAuthService } from "./google-auth";

export type SequenceStep =
	| { type: "command"; text: string }
	| { type: "delay"; seconds: number };

export function defaultSteps(): SequenceStep[] {
	return [{ type: "command", text: "" }];
}

/** Converts the first prototype's line-based format to the structured format. */
export function parseLegacySequence(sequence: string | undefined, fallbackCommand: string | undefined): SequenceStep[] {
	const source = sequence?.trim();
	if (!source) {
		return fallbackCommand?.trim() ? [{ type: "command", text: fallbackCommand.trim() }] : defaultSteps();
	}

	const result: SequenceStep[] = [];
	for (const line of source.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
		const separator = line.indexOf("|");
		if (separator === -1) {
			result.push({ type: "command", text: line });
			continue;
		}

		const seconds = Number(line.slice(0, separator).trim()) / 1000;
		const text = line.slice(separator + 1).trim();
		if (!Number.isFinite(seconds) || seconds < 0 || !text) throw new Error(`Séquence invalide : ${line}`);
		if (seconds > 0) result.push({ type: "delay", seconds });
		result.push({ type: "command", text });
	}
	return result.length ? result : defaultSteps();
}

export function normalizeSteps(value: unknown, legacySequence?: string, legacyCommand?: string): SequenceStep[] {
	if (!Array.isArray(value)) return parseLegacySequence(legacySequence, legacyCommand);

	const result: SequenceStep[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const candidate = item as { type?: unknown; text?: unknown; seconds?: unknown };
		if (candidate.type === "command") {
			result.push({ type: "command", text: typeof candidate.text === "string" ? candidate.text : "" });
		} else if (candidate.type === "delay") {
			const seconds = Number(candidate.seconds);
			if (Number.isFinite(seconds) && seconds >= 0) result.push({ type: "delay", seconds });
		}
	}
	return result.length ? result : defaultSteps();
}

const wait = (durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs));

/** Serializes all button presses so Google Assistant never receives overlapping conversations. */
export class CommandRunner {
	private queue: Promise<void> = Promise.resolve();

	run(steps: SequenceStep[], auth: GoogleAuthService, options: AssistantRequestOptions): Promise<void> {
		const job = this.queue.then(async () => {
			for (const step of steps) {
				if (step.type === "delay") {
					if (step.seconds > 0) await wait(Math.round(step.seconds * 1000));
					continue;
				}
				if (!step.text.trim()) throw new Error("Une étape de commande est vide.");
				await auth.sendText(step.text, options);
			}
		});
		this.queue = job.catch(() => undefined);
		return job;
	}
}
