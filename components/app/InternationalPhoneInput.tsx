"use client";

import { AsYouType, getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/max";
import { useEffect, useId, useRef, useState } from "react";
import { inspectWhatsAppPhone } from "@/lib/bot/whatsapp-phone";
import { AppSelect, type AppSelectOption } from "./AppSelect";

type InternationalPhoneInputProps = {
  value: string;
  onValueChange(value: string): void;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

const regionNames = new Intl.DisplayNames(["es-AR"], { type: "region" });

function flag(country: CountryCode): string {
  return [...country].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

function countryName(country: CountryCode): string {
  return regionNames.of(country) ?? country;
}

const countries = getCountries().map((country) => ({
  country,
  callingCode: getCountryCallingCode(country),
  name: countryName(country),
})).sort((left, right) => left.name.localeCompare(right.name, "es"));

const countryOptions: AppSelectOption[] = countries.map(({ country, callingCode, name }) => ({
  value: country,
  label: `${flag(country)} ${name} (+${callingCode})`,
  description: `${country} · +${callingCode}`,
}));

function nationalDisplay(value: string): { country: CountryCode; national: string } | null {
  const details = inspectWhatsAppPhone(value);
  if (!details?.country) return null;
  const prefix = `+${details.countryCallingCode}`;
  return {
    country: details.country,
    national: details.international.startsWith(prefix) ? details.international.slice(prefix.length).trim() : details.national,
  };
}

function formatForCountry(value: string, country: CountryCode) {
  const formatter = new AsYouType(country);
  const national = formatter.input(value);
  const digits = value.replace(/\D/gu, "");
  return { national, international: formatter.getNumber()?.number ?? `+${getCountryCallingCode(country)}${digits}` };
}

function partialNationalDisplay(value: string, country: CountryCode): string {
  if (!value) return "";
  const digits = value.replace(/\D/gu, "");
  const callingCode = getCountryCallingCode(country);
  const nationalDigits = digits.startsWith(callingCode) ? digits.slice(callingCode.length) : digits;
  return new AsYouType(country).input(nationalDigits);
}

export function InternationalPhoneInput({
  value,
  onValueChange,
  label = "WhatsApp",
  helperText,
  required = false,
  disabled = false,
  className = "",
}: InternationalPhoneInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(() => nationalDisplay(value)?.country ?? "AR");
  const [touched, setTouched] = useState(false);
  const details = value ? inspectWhatsAppPhone(value) : null;
  const country = details?.country ?? selectedCountry;
  const national = details ? nationalDisplay(value)?.national ?? details.national : partialNationalDisplay(value, country);
  const invalid = Boolean(value && !details);
  const validationMessage = !value && required
    ? "Ingresá el número de WhatsApp."
    : invalid
      ? `Revisá el número para ${countryName(country)}.`
      : "";

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationMessage);
  }, [validationMessage]);

  function emit(nextValue: string) {
    onValueChange(nextValue);
  }

  function applyInternational(input: string): boolean {
    const parsed = nationalDisplay(input);
    if (!parsed) return false;
    setSelectedCountry(parsed.country);
    const normalized = inspectWhatsAppPhone(input)?.e164 ?? input;
    emit(normalized);
    return true;
  }

  function changeNational(input: string) {
    if (input.trimStart().startsWith("+") && applyInternational(input)) return;
    if (input.trimStart().startsWith("+")) {
      const formatter = new AsYouType();
      formatter.input(input);
      const detectedCountry = formatter.getCountry();
      if (detectedCountry) setSelectedCountry(detectedCountry);
      emit(input);
      return;
    }
    const formatted = formatForCountry(input, country);
    emit(input.replace(/\D/gu, "") ? formatted.international : "");
  }

  function changeCountry(next: string) {
    const selected = next as CountryCode;
    setSelectedCountry(selected);
    const formatted = formatForCountry(national, selected);
    emit(national.replace(/\D/gu, "") ? formatted.international : "");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return <fieldset className={`min-w-0 ${className}`} disabled={disabled}>
    <legend className="mb-1.5 text-sm font-medium text-ink-soft">{label}{required ? <span aria-hidden="true"> *</span> : null}</legend>
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(12rem,0.9fr)_minmax(14rem,1.1fr)]">
      <AppSelect
        ariaLabel={`País de ${label}`}
        value={country}
        onValueChange={changeCountry}
        options={countryOptions}
        searchable
        disabled={disabled}
        searchPlaceholder="País, código ISO o prefijo"
        emptyMessage="No encontramos ese país o prefijo."
      />
      <div className="relative min-w-0">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center border-r border-line pr-3 text-sm font-semibold text-ink-soft">+{getCountryCallingCode(country)}</span>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-label={`${label} — número nacional`}
          required={required}
          disabled={disabled}
          value={national}
          onChange={(event) => changeNational(event.target.value)}
          onBlur={() => setTouched(true)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text").trim();
            const looksInternational = pasted.startsWith("+") || /^\d+$/u.test(pasted);
            if (looksInternational && applyInternational(pasted)) event.preventDefault();
          }}
          aria-invalid={touched && Boolean(validationMessage)}
          aria-describedby={`${id}-help${touched && validationMessage ? ` ${id}-error` : ""}`}
          className="app-input min-h-12 pl-[4.75rem]"
          placeholder={country === "AR" ? "9 341 667 4074" : `Número nacional de ${countryName(country)}`}
        />
      </div>
    </div>
    <p id={`${id}-help`} className="mt-1.5 text-xs font-normal leading-5 text-ink-mute">{helperText ?? "Seleccioná el país e ingresá el número nacional. No verificamos si tiene una cuenta activa de WhatsApp."}</p>
    {touched && validationMessage ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-red-700">{validationMessage}</p> : null}
  </fieldset>;
}
