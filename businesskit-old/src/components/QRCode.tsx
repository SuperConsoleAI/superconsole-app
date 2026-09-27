// src/components/QRCode.tsx
// High-performance SVG QR Code generator for E-Invoices, E-Way Bills, Payments, and URLs.

import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import QRCode from "qrcode";

export interface QRCodeProps {
  value: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
}

export const QRCodeView = component$<QRCodeProps>(({
  value,
  size = 180,
  darkColor = "#000000",
  lightColor = "#ffffff",
}) => {
  const svgHtml = useSignal<string>("");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => value);
    track(() => darkColor);
    track(() => lightColor);

    if (!value) {
      svgHtml.value = "";
      return;
    }

    try {
      const svg = await QRCode.toString(value, {
        type: "svg",
        margin: 2,
        width: size,
        color: {
          dark: darkColor,
          light: lightColor,
        },
      });
      svgHtml.value = svg;
    } catch (err) {
      console.error("Failed to generate QR Code:", err);
      svgHtml.value = "";
    }
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: lightColor,
        padding: "0.5rem",
        borderRadius: "0.5rem",
        width: `${size}px`,
        height: `${size}px`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={svgHtml.value}
    />
  );
});
