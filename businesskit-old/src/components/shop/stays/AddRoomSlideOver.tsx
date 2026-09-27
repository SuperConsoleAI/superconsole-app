// src/components/shop/stays/AddRoomSlideOver.tsx
//
// SlideOver component to create a new Hotel / Stay Room.
// Follows exact color palette & height standards of AddProductModal.tsx and SlideOver.tsx:
// - Panel: var(--surface-2)
// - Inputs: var(--field-fill) with var(--border)
// - Header height: 3.5rem, padding: 0 1.25rem
// - Footer padding: 0.875rem 1.25rem

import { component$, useSignal, useTask$, $, PropFunction, type Signal } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import type { StayRoom } from "./RoomLayoutGrid";

interface AddRoomSlideOverProps {
  open: Signal<boolean>;
  roomToEdit?: StayRoom | null;
  onSaved$?: PropFunction<(room: StayRoom) => void>;
}

const COMMON_AMENITIES = [
  "AC",
  "Free WiFi",
  "Smart TV",
  "Balcony",
  "Sea View",
  "Mini Fridge",
  "Breakfast Included",
  "Hot Water",
];

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const AddRoomSlideOver = component$<AddRoomSlideOverProps>(({ open, roomToEdit, onSaved$ }) => {
  const roomName = useSignal("");
  const roomNumber = useSignal("");
  const floor = useSignal("");
  const capacity = useSignal("2");
  const baseRate = useSignal("2500");
  const selectedAmenities = useSignal<string[]>(["AC", "Free WiFi", "Smart TV", "Hot Water"]);
  const errorMsg = useSignal("");
  const saving = useSignal(false);

  useTask$(({ track }) => {
    track(() => roomToEdit);
    if (roomToEdit) {
      roomName.value = roomToEdit.name || "";
      roomNumber.value = roomToEdit.number || "";
      floor.value = roomToEdit.floor || "";
      capacity.value = String(roomToEdit.capacity || 2);
      baseRate.value = String(roomToEdit.base_rate || 2500);
      try {
        selectedAmenities.value = typeof roomToEdit.amenities === "string" 
          ? JSON.parse(roomToEdit.amenities)
          : roomToEdit.amenities || ["AC", "Free WiFi"];
      } catch {
        selectedAmenities.value = ["AC", "Free WiFi"];
      }
    } else {
      roomName.value = "";
      roomNumber.value = "";
      floor.value = "";
      capacity.value = "2";
      baseRate.value = "2500";
      selectedAmenities.value = ["AC", "Free WiFi", "Smart TV", "Hot Water"];
    }
  });

  const handleSave = $(async () => {
    if (!roomName.value.trim()) {
      errorMsg.value = "Room name is required (e.g. Room 101 or Deluxe Suite)";
      return;
    }

    saving.value = true;
    errorMsg.value = "";

    try {
      let savedRoom: StayRoom;
      if (roomToEdit?.id) {
        savedRoom = await invoke<StayRoom>("shop_update_stay_room", {
          data: {
            id: roomToEdit.id,
            name: roomName.value.trim(),
            number: roomNumber.value.trim() || null,
            floor: floor.value.trim() || null,
            capacity: parseInt(capacity.value) || 2,
            base_rate: parseFloat(baseRate.value) || 0,
            amenities: selectedAmenities.value,
          },
        });
      } else {
        savedRoom = await invoke<StayRoom>("shop_create_stay_room", {
          data: {
            name: roomName.value.trim(),
            number: roomNumber.value.trim() || null,
            floor: floor.value.trim() || null,
            capacity: parseInt(capacity.value) || 2,
            base_rate: parseFloat(baseRate.value) || 0,
            amenities: selectedAmenities.value,
          },
        });
      }

      open.value = false;
      onSaved$?.(savedRoom);
    } catch (e: any) {
      console.error("[AddRoomSlideOver] save failed:", e);
      errorMsg.value = e.message || "Failed to save room";
    } finally {
      saving.value = false;
    }
  });

  return (
    <SlideOver
      open={open}
      title={roomToEdit ? "Edit Room / Suite" : "Add Room / Suite"}
      subtitle="Configure room details, rate, and amenities"
      icon={roomToEdit ? "package" : "plus"}
      width="480px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {errorMsg.value && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "var(--error)",
              padding: "0.75rem 1rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
            }}
          >
            {errorMsg.value}
          </div>
        )}

        <div>
          <label style={labelStyle}>
            Room Name / Title <span style="color:var(--error);">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Room 101 or Executive Ocean Suite"
            value={roomName.value}
            onInput$={(e: any) => (roomName.value = e.target.value)}
            style={inputStyle}
            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Room Number</label>
            <input
              type="text"
              placeholder="101"
              value={roomNumber.value}
              onInput$={(e: any) => (roomNumber.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Floor / Block</label>
            <input
              type="text"
              placeholder="1st Floor / East Wing"
              value={floor.value}
              onInput$={(e: any) => (floor.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Capacity (Guests)</label>
            <input
              type="number"
              min="1"
              max="20"
              value={capacity.value}
              onInput$={(e: any) => (capacity.value = e.target.value)}
              style={inputStyle}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          <div>
            <label style={labelStyle}>Base Rate / Night (₹)</label>
            <input
              type="number"
              readOnly
              value={baseRate.value}
              title="Base rate is managed via Product Catalog Pricing"
              style={{
                ...inputStyle,
                opacity: 0.7,
                cursor: "not-allowed",
                background: "var(--surface-3)",
              }}
            />
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Managed via Product Catalog (Edit Product)
            </div>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Amenities & Features</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {COMMON_AMENITIES.map((am) => {
              const checked = selectedAmenities.value.includes(am);
              return (
                <label
                  key={am}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    background: "var(--surface-3)",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange$={() => {
                      if (checked) {
                        selectedAmenities.value = selectedAmenities.value.filter((a) => a !== am);
                      } else {
                        selectedAmenities.value = [...selectedAmenities.value, am];
                      }
                    }}
                  />
                  {am}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        q:slot="footer"
        style={{
          padding: "0.875rem 1.25rem",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.75rem",
        }}
      >
        <button
          type="button"
          onClick$={() => (open.value = false)}
          style={{
            height: "2.25rem",
            padding: "0 1rem",
            borderRadius: "0.375rem",
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick$={handleSave}
          disabled={saving.value}
          style={{
            height: "2.25rem",
            padding: "0 1.25rem",
            borderRadius: "0.375rem",
            background: "var(--button-primary-bg)",
            border: "none",
            color: "var(--button-primary-text)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: saving.value ? "wait" : "pointer",
            opacity: saving.value ? 0.7 : 1,
          }}
        >
          {saving.value ? "Saving..." : "Save Room"}
        </button>
      </div>
    </SlideOver>
  );
});
