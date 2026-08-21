import ct from 'countries-and-timezones';

export const getDetectedCountry = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezone = ct.getTimezone(tz);
    if (timezone && timezone.country) {
      return timezone.country.toLowerCase(); // e.g. "in", "us", "uk"
    }
  } catch (e) {
    console.error("Failed to detect timezone", e);
  }
  return "world"; // fallback
};

export const getUserCountry = () => {
  return localStorage.getItem('userCountry') || getDetectedCountry();
};

export const setUserCountry = (countryCode) => {
  localStorage.setItem('userCountry', countryCode.toLowerCase());
};

export const getAllCountries = () => {
  const countries = ct.getAllCountries();
  return Object.values(countries).map(c => ({
    id: c.id.toLowerCase(),
    name: c.name
  })).sort((a, b) => a.name.localeCompare(b.name));
};
