// src/components/app/UserSettingsModal.tsx
//
// Desktop port of businesskit-web/src/components/UserSettings.tsx
// Supports first_name, last_name, profile_picture_url, bio, location, website, social_links.
// Includes MediaPicker / Upload support for profile avatar.
//

import { component$, useStylesScoped$, useSignal, useTask$, $, type PropFunction } from "@builder.io/qwik";
import { LuImage, LuUpload } from "@qwikest/icons/lucide";
import { getUserSettings, updateUserSettings, type UserSettingsData } from "~/lib/ipc";
import { triggerHaptic } from "~/lib/haptics";
import { MediaPickerModal, type MediaItem } from "~/components/media/MediaPickerModal";
import { MediaModal } from "~/components/media/MediaModal";

export interface UserSettingsModalProps {
  isOpen: boolean;
  onClose$: PropFunction<() => void>;
}

const STYLES = `
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 1rem;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .modal-content {
    background: var(--surface-2, #2c2c2c);
    border: 1px solid var(--border, #333);
    border-radius: 0.75rem;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border, #333);
    flex-shrink: 0;
  }
  .modal-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary, #fff);
    margin: 0;
    letter-spacing: -0.01em;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary, #888);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    transition: color 0.15s;
  }
  .close-btn:hover {
    color: var(--text-primary, #fff);
  }
  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
  }
  .form-row {
    margin-bottom: 1.15rem;
  }
  .form-row label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary, #aaa);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .form-input {
    width: 100%;
    padding: 0.65rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border, #444);
    background: var(--surface-2, #2a2a2a);
    color: var(--text-primary, #fff);
    font-family: inherit;
    font-size: 0.9rem;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .form-input:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  .social-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 480px) {
    .social-grid {
      grid-template-columns: 1fr;
    }
  }
  .btn-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 0.75rem;
    margin-top: 0.5rem;
  }
  .btn {
    padding: 0.65rem 1.25rem;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
    font-family: inherit;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--button-primary-background, var(--accent, #3b82f6));
    color: var(--button-primary-text, #fff);
    border: none;
  }
  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-primary, #fff);
    border: 1px solid var(--border, #444);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--muted, rgba(255, 255, 255, 0.05));
  }
  .banner {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1.25rem;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .banner.error {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .banner.success {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .avatar-preview-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .avatar-preview {
    width: 3.75rem;
    height: 3.75rem;
    border-radius: 50%;
    background: var(--surface-3, #333);
    border: 2px solid var(--border, #444);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--text-primary, #fff);
    overflow: hidden;
    flex-shrink: 0;
  }
`;

export const UserSettingsModal = component$<UserSettingsModalProps>((props) => {
  useStylesScoped$(STYLES);

  const isLoading = useSignal(true);
  const isSaving = useSignal(false);
  const errorMsg = useSignal("");
  const successMsg = useSignal("");

  const showAvatarPicker = useSignal(false);
  const showAvatarUpload = useSignal(false);

  const formData = useSignal<{
    firstName: string;
    lastName: string;
    profilePictureUrl: string;
    bio: string;
    location: string;
    website: string;
    socialLinks: { twitter: string; instagram: string; linkedin: string; github: string };
  }>({
    firstName: "",
    lastName: "",
    profilePictureUrl: "",
    bio: "",
    location: "",
    website: "",
    socialLinks: { twitter: "", instagram: "", linkedin: "", github: "" },
  });

  useTask$(({ track }) => {
    track(() => props.isOpen);

    if (props.isOpen) {
      isLoading.value = true;
      errorMsg.value = "";
      successMsg.value = "";

      const checkUser = async () => {
        try {
          const user: UserSettingsData = await getUserSettings();
          if (user) {
            let links = { twitter: "", instagram: "", linkedin: "", github: "" };
            if (typeof user.socialLinks === "string") {
              try {
                links = { ...links, ...JSON.parse(user.socialLinks) };
              } catch { /* ignore */ }
            } else if (user.socialLinks && typeof user.socialLinks === "object") {
              links = { ...links, ...(user.socialLinks as any) };
            }

            formData.value = {
              firstName: user.firstName || "",
              lastName: user.lastName || "",
              profilePictureUrl: user.profilePictureUrl || "",
              bio: user.bio || "",
              location: user.location || "",
              website: user.website || "",
              socialLinks: links,
            };
          }
        } catch {
          errorMsg.value = "Failed to load account settings.";
        } finally {
          isLoading.value = false;
        }
      };

      checkUser();
    }
  });

  const handleAvatarSelected = $(async (item: MediaItem) => {
    if (item?.url) {
      formData.value = {
        ...formData.value,
        profilePictureUrl: item.url,
      };
    }
    showAvatarPicker.value = false;
  });

  const handleAvatarUploaded = $(async (item: any) => {
    if (item?.url) {
      formData.value = {
        ...formData.value,
        profilePictureUrl: item.url,
      };
    }
    showAvatarUpload.value = false;
  });

  const handleSubmit = $(async () => {
    isSaving.value = true;
    errorMsg.value = "";
    successMsg.value = "";
    triggerHaptic("medium");

    try {
      const res = await updateUserSettings({
        firstName: formData.value.firstName.trim() || undefined,
        lastName: formData.value.lastName.trim() || undefined,
        profilePictureUrl: formData.value.profilePictureUrl.trim() || undefined,
        bio: formData.value.bio.trim() || undefined,
        location: formData.value.location.trim() || undefined,
        website: formData.value.website.trim() || undefined,
        socialLinks: formData.value.socialLinks,
      });

      if (res?.success) {
        successMsg.value = "Account settings updated successfully.";
        setTimeout(() => {
          props.onClose$();
        }, 1200);
      } else {
        errorMsg.value = res?.message || "Failed to update account settings.";
      }
    } catch (e: any) {
      errorMsg.value = typeof e === "string" ? e : "An error occurred while saving your account settings.";
    } finally {
      isSaving.value = false;
    }
  });

  if (!props.isOpen) return null;

  const initials =
    ((formData.value.firstName?.[0] || "") + (formData.value.lastName?.[0] || "")).toUpperCase() || "ME";

  return (
    <>
      <div
        class="modal-overlay"
        onClick$={(e) => {
          if ((e.target as HTMLElement).className.includes("modal-overlay")) {
            props.onClose$();
          }
        }}
      >
        <div class="modal-content" onClick$={(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 class="modal-title">About You</h3>
            <button class="close-btn" onClick$={props.onClose$} title="Close">
              ✕
            </button>
          </div>

          <div class="modal-body">
            {errorMsg.value && <div class="banner error">{errorMsg.value}</div>}
            {successMsg.value && <div class="banner success">{successMsg.value}</div>}

            {isLoading.value ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
                Loading profile settings...
              </div>
            ) : (
              <div class="form">
                {/* Avatar Preview & Actions */}
                <div class="avatar-preview-row">
                  <div class="avatar-preview">
                    {formData.value.profilePictureUrl ? (
                      <img
                        src={formData.value.profilePictureUrl}
                        alt="Avatar"
                        width="60"
                        height="60"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError$={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div class="form-row" style={{ marginBottom: "0.4rem" }}>
                      <label>Profile Picture URL</label>
                      <input
                        class="form-input"
                        placeholder="https://example.com/avatar.jpg"
                        value={formData.value.profilePictureUrl}
                        onInput$={(e) => {
                          formData.value = {
                            ...formData.value,
                            profilePictureUrl: (e.target as HTMLInputElement).value,
                          };
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick$={() => {
                          showAvatarPicker.value = true;
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.3rem 0.65rem",
                          background: "var(--field-fill, var(--surface-2))",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                        }}
                      >
                        <LuImage style={{ width: "0.8rem", height: "0.8rem" }} />
                        Browse Media
                      </button>
                      <button
                        type="button"
                        onClick$={() => {
                          showAvatarUpload.value = true;
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.3rem 0.65rem",
                          background: "var(--field-fill, var(--surface-2))",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                        }}
                      >
                        <LuUpload style={{ width: "0.8rem", height: "0.8rem" }} />
                        Upload
                      </button>
                      {formData.value.profilePictureUrl && (
                        <button
                          type="button"
                          onClick$={() => {
                            formData.value = {
                              ...formData.value,
                              profilePictureUrl: "",
                            };
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--error, #ef4444)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            padding: "0.2rem 0.4rem",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* First & Last Name */}
                <div class="social-grid">
                  <div class="form-row">
                    <label>First Name</label>
                    <input
                      class="form-input"
                      placeholder="First name"
                      value={formData.value.firstName}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          firstName: (e.target as HTMLInputElement).value,
                        };
                      }}
                    />
                  </div>
                  <div class="form-row">
                    <label>Last Name</label>
                    <input
                      class="form-input"
                      placeholder="Last name"
                      value={formData.value.lastName}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          lastName: (e.target as HTMLInputElement).value,
                        };
                      }}
                    />
                  </div>
                </div>

                {/* Bio */}
                <div class="form-row">
                  <label>Bio</label>
                  <textarea
                    class="form-input"
                    rows={3}
                    placeholder="Tell us a little bit about yourself..."
                    value={formData.value.bio}
                    onInput$={(e) => {
                      formData.value = {
                        ...formData.value,
                        bio: (e.target as HTMLTextAreaElement).value,
                      };
                    }}
                  ></textarea>
                </div>

                {/* Location & Website */}
                <div class="social-grid">
                  <div class="form-row">
                    <label>Location</label>
                    <input
                      class="form-input"
                      placeholder="e.g. San Francisco, CA"
                      value={formData.value.location}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          location: (e.target as HTMLInputElement).value,
                        };
                      }}
                    />
                  </div>
                  <div class="form-row">
                    <label>Website</label>
                    <input
                      class="form-input"
                      placeholder="https://yoursite.com"
                      value={formData.value.website}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          website: (e.target as HTMLInputElement).value,
                        };
                      }}
                    />
                  </div>
                </div>

                {/* Social Links */}
                <div class="form-row">
                  <label>Social Links</label>
                  <div class="social-grid">
                    <input
                      class="form-input"
                      placeholder="Twitter (X) URL"
                      value={formData.value.socialLinks.twitter}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          socialLinks: {
                            ...formData.value.socialLinks,
                            twitter: (e.target as HTMLInputElement).value,
                          },
                        };
                      }}
                    />
                    <input
                      class="form-input"
                      placeholder="Instagram URL"
                      value={formData.value.socialLinks.instagram}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          socialLinks: {
                            ...formData.value.socialLinks,
                            instagram: (e.target as HTMLInputElement).value,
                          },
                        };
                      }}
                    />
                    <input
                      class="form-input"
                      placeholder="LinkedIn URL"
                      value={formData.value.socialLinks.linkedin}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          socialLinks: {
                            ...formData.value.socialLinks,
                            linkedin: (e.target as HTMLInputElement).value,
                          },
                        };
                      }}
                    />
                    <input
                      class="form-input"
                      placeholder="GitHub URL"
                      value={formData.value.socialLinks.github}
                      onInput$={(e) => {
                        formData.value = {
                          ...formData.value,
                          socialLinks: {
                            ...formData.value.socialLinks,
                            github: (e.target as HTMLInputElement).value,
                          },
                        };
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons (no bottom divider line) */}
                <div class="btn-row">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    onClick$={props.onClose$}
                    disabled={isSaving.value}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick$={handleSubmit}
                    disabled={isSaving.value}
                  >
                    {isSaving.value ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Avatar Media Picker Modal */}
      <MediaPickerModal
        open={showAvatarPicker}
        filterType="image"
        zIndex={100005}
        onSelected$={handleAvatarSelected}
      />

      {/* Direct Upload Modal for Avatar */}
      <MediaModal
        open={showAvatarUpload}
        zIndex={100005}
        onUploaded$={handleAvatarUploaded}
      />
    </>
  );
});
