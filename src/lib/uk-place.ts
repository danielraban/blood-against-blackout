const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const STREET =
  /\b(road|rd|street|st|lane|ln|avenue|ave|close|drive|way|hill|gardens|gdns|terrace|place)\b/i;

export function formatUkPostcode(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function ukPostcodeIn(value: string) {
  const match = value.match(UK_POSTCODE);
  if (!match?.[1]) return null;
  return formatUkPostcode(match[1]);
}

export function ukCityAndPostcode(address: string) {
  const postalCode = ukPostcodeIn(address);
  const withoutPostal = postalCode
    ? address.replace(UK_POSTCODE, " ")
    : address;
  const parts = withoutPostal
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part && !/^(uk|united kingdom|gb)$/i.test(part));
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]?.replace(/[.\s]+$/g, "") ?? "";
    if (!part || isStreetish(part)) continue;
    return { city: formatUkCity(part) || null, postalCode };
  }
  return { city: null, postalCode };
}

export function formatUkCity(value: string) {
  const city = value.replace(/,\s*GB$/i, "").replace(/\s+/g, " ").trim();
  if (!city || /^(gb|uk|united kingdom)$/i.test(city)) return "";
  if (city !== city.toUpperCase()) return city;
  return city.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function isStreetish(value: string) {
  if (/^\d/.test(value)) return true;
  if (/^st\.?\s+\S/i.test(value)) return false;
  return STREET.test(value);
}
