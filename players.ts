/** Roster of team OrdaX. Nicknames are kept exactly as given (case, underscores, hyphens). */
export const ROSTER: ReadonlyArray<{ nickname: string; name: string }> = [
  { nickname: "ernvr", name: "Ернар" },
  { nickname: "Saika7sk", name: "Саин" },
  { nickname: "ppogh_p", name: "Павел" },
  { nickname: "-freetrifle-", name: "Дмитрий" },
  { nickname: "SQ666", name: "Санжар" },
  { nickname: "Aksh02", name: "Акжан" },
  { nickname: "moral1ty", name: "Альжан" },
  { nickname: "moon_ds", name: "Сырым" },
  { nickname: "kel4nd", name: "Адиль" },
  { nickname: "Gigallag", name: "Ерасыл (Касик)" },
];

export const GAME = "cs2";

/** Reference level ranges of FACEIT CS skill levels (min ELO of each level). */
export const LEVEL_MIN: ReadonlyArray<number> = [100, 501, 751, 901, 1051, 1201, 1351, 1531, 1751, 2001];
