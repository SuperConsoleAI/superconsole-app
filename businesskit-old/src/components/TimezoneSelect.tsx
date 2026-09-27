import { component$, type PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius } = designSystem;

interface TimezoneSelectProps {
  value?: string;
  onTimezoneChange$?: PropFunction<(timezone: string) => void>;
  id?: string;
}

export const TIMEZONE_OPTIONS = [
  { group: "North America", options: [
    { value: "Pacific/Honolulu", label: "Hawaii (HST, UTC-10)" },
    { value: "America/Anchorage", label: "Alaska (AKDT, UTC-8)" },
    { value: "America/Los_Angeles", label: "Pacific Time - Los Angeles (PST, UTC-8)" },
    { value: "America/Tijuana", label: "Pacific Time - Tijuana (PDT, UTC-7)" },
    { value: "America/Phoenix", label: "Arizona (MST, UTC-7)" },
    { value: "America/Denver", label: "Mountain Time - Denver (MDT, UTC-6)" },
    { value: "America/Chihuahua", label: "Mountain Time - Chihuahua (MDT, UTC-6)" },
    { value: "America/Chicago", label: "Central Time - Chicago (CDT, UTC-5)" },
    { value: "America/Mexico_City", label: "Central Time - Mexico City (CDT, UTC-5)" },
    { value: "America/Regina", label: "Central - Saskatchewan (CST, UTC-6)" },
    { value: "America/New_York", label: "Eastern Time - New York (EST, UTC-5)" },
    { value: "America/Toronto", label: "Eastern Time - Toronto (EST, UTC-5)" },
    { value: "America/Havana", label: "Cuba (EST, UTC-5)" },
    { value: "America/Indianapolis", label: "Indiana (EST, UTC-5)" },
  ]},
  { group: "Central & South America", options: [
    { value: "America/Caracas", label: "Caracas (VST, UTC-4.5)" },
    { value: "America/Bogota", label: "Bogota (SPST, UTC-5)" },
    { value: "America/Lima", label: "Lima (EST, UTC-5)" },
    { value: "America/Santiago", label: "Santiago (PSST, UTC-4)" },
    { value: "America/Asuncion", label: "Asuncion (PYT, UTC-4)" },
    { value: "America/Halifax", label: "Atlantic - Halifax (ADT, UTC-3)" },
    { value: "America/Sao_Paulo", label: "Sao Paulo (ESAST, UTC-3)" },
    { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (AST, UTC-3)" },
    { value: "America/Montevideo", label: "Montevideo (MST, UTC-3)" },
    { value: "America/Godthab", label: "Greenland (GDT, UTC-3)" },
    { value: "America/St_Johns", label: "Newfoundland (NDT, UTC-2.5)" },
    { value: "America/Noronha", label: "Noronha (UTC-2)" },
    { value: "Atlantic/Azores", label: "Azores (ADT, UTC-0)" },
    { value: "Atlantic/Cape_Verde", label: "Cape Verde (CVST, UTC-1)" },
  ]},
  { group: "Europe & Africa", options: [
    { value: "UTC", label: "UTC" },
    { value: "Europe/London", label: "London (GMT/BST, UTC+0/+1)" },
    { value: "Europe/Dublin", label: "Dublin (GMT/IST, UTC+0/+1)" },
    { value: "Africa/Casablanca", label: "Casablanca (MDT, UTC+1)" },
    { value: "Europe/Paris", label: "Paris (CEDT, UTC+2)" },
    { value: "Europe/Berlin", label: "Berlin (CEDT, UTC+2)" },
    { value: "Europe/Amsterdam", label: "Amsterdam (WEDT, UTC+2)" },
    { value: "Europe/Brussels", label: "Brussels (CEDT, UTC+2)" },
    { value: "Europe/Vienna", label: "Vienna (CEDT, UTC+2)" },
    { value: "Europe/Prague", label: "Prague (CEDT, UTC+2)" },
    { value: "Europe/Budapest", label: "Budapest (CEDT, UTC+2)" },
    { value: "Europe/Warsaw", label: "Warsaw (CEDT, UTC+2)" },
    { value: "Europe/Rome", label: "Rome (CEDT, UTC+2)" },
    { value: "Europe/Madrid", label: "Madrid (CEDT, UTC+2)" },
    { value: "Africa/Lagos", label: "Lagos (WCAST, UTC+1)" },
    { value: "Africa/Johannesburg", label: "Johannesburg (SAST, UTC+2)" },
    { value: "Africa/Nairobi", label: "Nairobi (EAST, UTC+3)" },
    { value: "Africa/Cairo", label: "Cairo (EST, UTC+2)" },
  ]},
  { group: "Middle East", options: [
    { value: "Europe/Istanbul", label: "Istanbul (TDT, UTC+3)" },
    { value: "Europe/Athens", label: "Athens (EEDT, UTC+3)" },
    { value: "Europe/Bucharest", label: "Bucharest (EEDT, UTC+3)" },
    { value: "Europe/Helsinki", label: "Helsinki (FDT, UTC+3)" },
    { value: "Asia/Jerusalem", label: "Jerusalem (JDT, UTC+3)" },
    { value: "Asia/Beirut", label: "Beirut (MEDT, UTC+3)" },
    { value: "Asia/Damascus", label: "Damascus (SDT, UTC+3)" },
    { value: "Asia/Amman", label: "Amman (JST, UTC+3)" },
    { value: "Asia/Baghdad", label: "Baghdad (AST, UTC+3)" },
    { value: "Asia/Kuwait", label: "Kuwait (AST, UTC+3)" },
    { value: "Asia/Riyadh", label: "Riyadh (AST, UTC+3)" },
    { value: "Asia/Dubai", label: "Dubai (AST, UTC+4)" },
    { value: "Asia/Muscat", label: "Muscat (AST, UTC+4)" },
    { value: "Asia/Baku", label: "Baku (ADT, UTC+5)" },
    { value: "Asia/Tbilisi", label: "Tbilisi (GET, UTC+4)" },
    { value: "Asia/Yerevan", label: "Yerevan (CST, UTC+4)" },
    { value: "Asia/Tehran", label: "Tehran (IDT, UTC+4.5)" },
    { value: "Asia/Kabul", label: "Kabul (AST, UTC+4.5)" },
  ]},
  { group: "Asia", options: [
    { value: "Europe/Moscow", label: "Moscow (MSK, UTC+3)" },
    { value: "Europe/Samara", label: "Samara (SAMT, UTC+4)" },
    { value: "Asia/Karachi", label: "Karachi (PKT, UTC+5)" },
    { value: "Asia/Kolkata", label: "Kolkata (IST, UTC+5.5)" },
    { value: "Asia/Colombo", label: "Colombo (SLST, UTC+5.5)" },
    { value: "Asia/Kathmandu", label: "Kathmandu (NST, UTC+5.75)" },
    { value: "Asia/Dhaka", label: "Dhaka (BST, UTC+6)" },
    { value: "Asia/Almaty", label: "Almaty (CAST, UTC+6)" },
    { value: "Asia/Yangon", label: "Yangon (MST, UTC+6.5)" },
    { value: "Asia/Bangkok", label: "Bangkok (SAST, UTC+7)" },
    { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (SAST, UTC+7)" },
    { value: "Asia/Jakarta", label: "Jakarta (SAST, UTC+7)" },
    { value: "Asia/Novosibirsk", label: "Novosibirsk (NCAST, UTC+7)" },
    { value: "Asia/Krasnoyarsk", label: "Krasnoyarsk (NAST, UTC+8)" },
    { value: "Asia/Shanghai", label: "Shanghai (CST, UTC+8)" },
    { value: "Asia/Hong_Kong", label: "Hong Kong (HKT, UTC+8)" },
    { value: "Asia/Taipei", label: "Taipei (TST, UTC+8)" },
    { value: "Asia/Singapore", label: "Singapore (SST, UTC+8)" },
    { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (MPST, UTC+8)" },
    { value: "Asia/Manila", label: "Manila (MPST, UTC+8)" },
    { value: "Australia/Perth", label: "Perth (AWST, UTC+8)" },
    { value: "Asia/Irkutsk", label: "Irkutsk (NAEST, UTC+8)" },
    { value: "Asia/Seoul", label: "Seoul (KST, UTC+9)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST, UTC+9)" },
    { value: "Asia/Yakutsk", label: "Yakutsk (YAKT, UTC+9)" },
  ]},
  { group: "Australia & Pacific", options: [
    { value: "Australia/Darwin", label: "Darwin (ACST, UTC+9.5)" },
    { value: "Australia/Adelaide", label: "Adelaide (ACDT, UTC+10.5)" },
    { value: "Australia/Sydney", label: "Sydney (AEDT, UTC+11)" },
    { value: "Australia/Melbourne", label: "Melbourne (AEDT, UTC+11)" },
    { value: "Australia/Brisbane", label: "Brisbane (AEST, UTC+10)" },
    { value: "Australia/Hobart", label: "Hobart (AEDT, UTC+11)" },
    { value: "Pacific/Guam", label: "Guam (WPST, UTC+10)" },
    { value: "Asia/Vladivostok", label: "Vladivostok (VLAT, UTC+10)" },
    { value: "Asia/Magadan", label: "Magadan (MAGT, UTC+11)" },
    { value: "Pacific/Fiji", label: "Fiji (FJST, UTC+12)" },
    { value: "Pacific/Auckland", label: "Auckland (NZDT, UTC+13)" },
    { value: "Pacific/Tongatapu", label: "Tongatapu (TOT, UTC+13)" },
    { value: "Pacific/Apia", label: "Apia (WSDT, UTC+14)" },
  ]},
];

export const TimezoneSelect = component$<TimezoneSelectProps>(({
  value = "America/New_York",
  onTimezoneChange$,
  id,
}) => {
  return (
    <select
      id={id}
      value={value}
      onChange$={(e) => {
        onTimezoneChange$?.((e.target as HTMLSelectElement).value);
      }}
      style={`
        width: 100%;
        padding: 0.65rem 0.9rem;
        border: 1px solid var(--border);
        border-radius: ${borderRadius.md};
        background: var(--surface-1);
        color: var(--text-primary);
        font-size: ${typography.sizes.sm};
        transition: border-color 150ms ease, box-shadow 150ms ease;
        box-sizing: border-box;
        height: 2.75rem;
      `}
    >
      {TIMEZONE_OPTIONS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
});

export default TimezoneSelect;
