export const countryLanguages = {
  in: ['English', 'Hindi', 'Bengali', 'Telugu', 'Tamil', 'Marathi'],
  us: ['English', 'Spanish', 'Chinese'],
  gb: ['English'],
  ca: ['English', 'French'],
  fr: ['English', 'French'],
  de: ['English', 'German'],
  es: ['English', 'Spanish'],
  it: ['English', 'Italian'],
  cn: ['English', 'Chinese'],
  jp: ['English', 'Japanese'],
  kr: ['English'],
  ru: ['English', 'Russian'],
  br: ['English', 'Portuguese'],
  pt: ['English', 'Portuguese'],
  mx: ['English', 'Spanish'],
  za: ['English'],
  ae: ['English', 'Arabic'],
  sa: ['English', 'Arabic'],
  eg: ['English', 'Arabic'],
  au: ['English'],
  nz: ['English'],
  sg: ['English', 'Tamil', 'Chinese'],
  nl: ['English'],
  se: ['English'],
  no: ['English'],
  fi: ['English'],
  dk: ['English'],
  ch: ['English', 'German', 'French', 'Italian'],
  be: ['English', 'French', 'German'],
  // default fallback
  world: ['English', 'Spanish', 'French', 'German', 'Arabic', 'Hindi', 'Bengali', 'Telugu', 'Tamil', 'Portuguese', 'Italian', 'Chinese', 'Japanese', 'Russian', 'Marathi']
};

export const getLanguagesForCountry = (countryCode) => {
  const code = (countryCode || 'world').toLowerCase();
  return countryLanguages[code] || countryLanguages['world'];
};

export const getUserLanguage = () => {
  return localStorage.getItem('userLanguage') || 'English';
};

export const setUserLanguage = (lang) => {
  localStorage.setItem('userLanguage', lang);
};
