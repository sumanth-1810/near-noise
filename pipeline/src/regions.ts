export const REGIONS = ['North America', 'Latin America', 'Europe', 'Africa', 'Middle East', 'Asia', 'Oceania'] as const
export type Region = (typeof REGIONS)[number]

/** ISO code and English name for each country, grouped by region. */
const COUNTRIES: Record<Region, string> = {
  'North America': 'US United States|CA Canada|GL Greenland|PR Puerto Rico',
  'Latin America':
    'MX Mexico|BR Brazil|AR Argentina|CL Chile|CO Colombia|PE Peru|VE Venezuela|EC Ecuador|BO Bolivia|PY Paraguay|UY Uruguay|CU Cuba|DO Dominican Republic|HT Haiti|JM Jamaica|TT Trinidad and Tobago|BB Barbados|BS Bahamas|GT Guatemala|HN Honduras|SV El Salvador|NI Nicaragua|CR Costa Rica|PA Panama|BZ Belize|GY Guyana|SR Suriname|MQ Martinique|GP Guadeloupe|LC Saint Lucia|GD Grenada|VC Saint Vincent and the Grenadines|AG Antigua and Barbuda|DM Dominica|KN Saint Kitts and Nevis|CW Curaçao|AW Aruba|GF French Guiana',
  Europe:
    'GB United Kingdom|IE Ireland|FR France|DE Germany|IT Italy|ES Spain|PT Portugal|NL Netherlands|BE Belgium|LU Luxembourg|CH Switzerland|AT Austria|SE Sweden|NO Norway|DK Denmark|FI Finland|IS Iceland|PL Poland|CZ Czechia|SK Slovakia|HU Hungary|RO Romania|BG Bulgaria|GR Greece|RS Serbia|HR Croatia|SI Slovenia|BA Bosnia and Herzegovina|ME Montenegro|MK North Macedonia|AL Albania|XK Kosovo|UA Ukraine|BY Belarus|RU Russia|LT Lithuania|LV Latvia|EE Estonia|MD Moldova|MT Malta|CY Cyprus|MC Monaco|AD Andorra|LI Liechtenstein|SM San Marino|FO Faroe Islands|XE Europe|CS Serbia and Montenegro|SU Soviet Union|YU Yugoslavia|XG East Germany|CZ Czech Republic|CZ Czechoslovakia|GB England|GB Scotland|GB Wales|GB Northern Ireland',
  Africa:
    'NG Nigeria|GH Ghana|ZA South Africa|KE Kenya|TZ Tanzania|UG Uganda|ET Ethiopia|SN Senegal|ML Mali|CI Côte d’Ivoire|CI Ivory Coast|CM Cameroon|CD Democratic Republic of the Congo|CG Congo|AO Angola|MZ Mozambique|ZW Zimbabwe|ZM Zambia|MW Malawi|BW Botswana|NA Namibia|MG Madagascar|RW Rwanda|BI Burundi|SO Somalia|SD Sudan|SS South Sudan|ER Eritrea|DZ Algeria|MA Morocco|TN Tunisia|LY Libya|EG Egypt|NE Niger|BF Burkina Faso|GN Guinea|GW Guinea-Bissau|SL Sierra Leone|LR Liberia|TG Togo|BJ Benin|GM Gambia|MR Mauritania|CV Cape Verde|GA Gabon|GQ Equatorial Guinea|TD Chad|CF Central African Republic|LS Lesotho|SZ Eswatini|MU Mauritius|RE Réunion|SC Seychelles|KM Comoros|DJ Djibouti',
  'Middle East':
    'TR Turkey|IR Iran|IQ Iraq|SY Syria|LB Lebanon|IL Israel|PS Palestine|JO Jordan|SA Saudi Arabia|AE United Arab Emirates|QA Qatar|KW Kuwait|BH Bahrain|OM Oman|YE Yemen|AM Armenia|AZ Azerbaijan|GE Georgia',
  Asia: 'JP Japan|KR South Korea|KP North Korea|CN China|TW Taiwan|HK Hong Kong|MO Macao|MN Mongolia|IN India|PK Pakistan|BD Bangladesh|LK Sri Lanka|NP Nepal|BT Bhutan|MV Maldives|AF Afghanistan|ID Indonesia|MY Malaysia|SG Singapore|TH Thailand|VN Vietnam|PH Philippines|KH Cambodia|LA Laos|MM Myanmar|BN Brunei|TL Timor-Leste|KZ Kazakhstan|UZ Uzbekistan|KG Kyrgyzstan|TJ Tajikistan|TM Turkmenistan',
  Oceania: 'AU Australia|NZ New Zealand|FJ Fiji|PG Papua New Guinea|WS Samoa|TO Tonga|NC New Caledonia|PF French Polynesia|GU Guam|VU Vanuatu|SB Solomon Islands',
}

const BY_KEY = new Map<string, Region>()
for (const region of REGIONS) {
  for (const entry of COUNTRIES[region].split('|')) {
    const [code, ...name] = entry.split(' ')
    BY_KEY.set(code, region)
    BY_KEY.set(name.join(' ').toLowerCase(), region)
  }
}

export function regionOf(country?: string, area?: string): Region | undefined {
  return (country && BY_KEY.get(country)) || (area ? BY_KEY.get(area.toLowerCase()) : undefined)
}
