const instructionNames = (logs: string[]): Set<string> => new Set(logs.map((log) => log.match(/instruction:\s*([a-z0-9_ ]+)/i)?.[1]?.replace(/[\s_]/g, '').toLowerCase()).filter((name): name is string => Boolean(name)));

export const wasAccountCreated = (preBalance: number | undefined, postBalance: number | undefined): boolean => preBalance === 0 && (postBalance ?? 0) > 0;

export const isRaydiumPoolCreation = (logs: string[]): boolean => instructionNames(logs).has('createpool');

export const isOrcaWhirlpoolCreation = (logs: string[]): boolean => instructionNames(logs).has('initializepool');

export const isDammPoolCreation = (logs: string[]): boolean => {
	const names = instructionNames(logs);
	return names.has('initializepool') || names.has('initializecustomizablepool') || names.has('initializepoolwithdynamicconfig');
};

export const isDlmmPoolCreation = (logs: string[]): boolean => {
	const names = instructionNames(logs);
	return ['initializelbpair', 'initializelbpair2', 'initializecustomizablepermissionlesslbpair', 'initializecustomizablepermissionlesslbpair2', 'initializepermissionlbpair'].some((name) => names.has(name));
};