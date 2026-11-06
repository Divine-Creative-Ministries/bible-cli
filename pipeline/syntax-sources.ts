/**
 * Source rows of the bible-syntax.db artifact. Lives apart from build-syntax.ts
 * (which does its work on import) so the docs generator can read them.
 */
export const MACULA_HEBREW_COMMIT = '47db250bd55d0d8577f2a94fba114ef16c35b23c';
export const MACULA_GREEK_COMMIT = '8423afe47b9e8f24b7772e808af45c7159a6fe7e';

export const SYNTAX_SOURCES = [
  {
    id: 'macula-hebrew',
    title: 'MACULA Hebrew Linguistic Datasets (WLC syntax trees)',
    url: 'https://github.com/Clear-Bible/macula-hebrew/',
    version: MACULA_HEBREW_COMMIT,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'MACULA Hebrew Linguistic Datasets, available at https://github.com/Clear-Bible/macula-hebrew/ — (C) 2022-2024 Biblica, Inc, CC BY 4.0. Westminster trees (C) J. Alan Groves Center (CC BY 4.0); base text: Westminster Leningrad Codex (tanach.us, unrestricted).',
  },
  {
    id: 'macula-greek',
    title: 'MACULA Greek Linguistic Datasets (SBLGNT syntax trees)',
    url: 'https://github.com/Clear-Bible/macula-greek/',
    version: MACULA_GREEK_COMMIT,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'MACULA Greek Linguistic Datasets, available at https://github.com/Clear-Bible/macula-greek/ — (C) 2022-2024 Biblica, Inc, CC BY 4.0.',
  },
  {
    id: 'sblgnt',
    title: 'SBL Greek New Testament (base text of the MACULA Greek trees)',
    url: 'https://github.com/LogosBible/SBLGNT',
    version: null as string | null,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'SBLGNT, edited by Michael W. Holmes. Copyright 2010 by the Society of Biblical Literature and Logos Bible Software, CC BY 4.0.',
  },
  {
    id: 'stepbible-versification',
    title: 'STEPBible TAHOT/TAGNT alternate references (versification mapping only)',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    version: null as string | null,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Native-tradition to English-spine verse mapping derived from TAHOT/TAGNT data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0).',
  },
];
