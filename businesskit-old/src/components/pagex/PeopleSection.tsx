import { component$ } from "@builder.io/qwik";
import { LuFacebook, LuGithub, LuInstagram, LuYoutube, LuGlobe } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius } = designSystem;

export interface PeopleSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

// Flat URL fields per person — no nested arrays, renders cleanly in editor slideout
const SOCIAL_PLATFORMS = [
  { key: 'twitterUrl',   label: 'Twitter / X URL',   platform: 'twitter'   },
  { key: 'linkedinUrl',  label: 'LinkedIn URL',       platform: 'linkedin'  },
  { key: 'instagramUrl', label: 'Instagram URL',      platform: 'instagram' },
  { key: 'youtubeUrl',   label: 'YouTube URL',        platform: 'youtube'   },
  { key: 'facebookUrl',  label: 'Facebook URL',       platform: 'facebook'  },
  { key: 'githubUrl',    label: 'GitHub URL',         platform: 'github'    },
  { key: 'tiktokUrl',    label: 'TikTok URL',         platform: 'tiktok'    },
  { key: 'websiteUrl',   label: 'Website URL',        platform: 'website'   },
];

export const PeopleSectionSchema = [
  { name: 'title',            label: 'Section Title',           type: 'text' },
  { name: 'titleColor',       label: 'Title Color',             type: 'text' },
  { name: 'description',      label: 'Section Description',     type: 'text' },
  { name: 'descriptionColor', label: 'Description Color',       type: 'text' },
  { name: 'note',             label: 'Additional Note',         type: 'text' },
  { name: 'noteColor',        label: 'Note Color',              type: 'text' },
  { name: 'cardBgColor',      label: 'Card Background (all)',   type: 'text' },
  { name: 'nameColor',        label: 'Name Color (all)',        type: 'text' },
  { name: 'bioColor',         label: 'Bio Color (all)',         type: 'text' },
  { name: 'iconColor',        label: 'Social Icon Color (all)', type: 'text' },
  { name: 'bgColor',          label: 'Section Background Color', type: 'text' },
  {
    name: 'people',
    label: 'People',
    type: 'array',
    fields: [
      { name: 'name',        label: 'Name',          type: 'text' },
      { name: 'bio',         label: 'Bio / Role',    type: 'text' },
      { name: 'image_url',   label: 'Image URL',     type: 'text' },
      ...SOCIAL_PLATFORMS.map(p => ({ name: p.key, label: p.label, type: 'text' })),
    ]
  }
];

export const PeopleSectionDefaultData = {
  title: "Meet the Team",
  description: "The people behind the magic.",
  note: "",
  people: [
    {
      name: "Jane Smith",
      bio: "Lead Designer",
      image_url: "https://placehold.co/320x320?text=Jane",
      twitterUrl: "",
      linkedinUrl: "",
      instagramUrl: "",
      youtubeUrl: "",
      facebookUrl: "",
      githubUrl: "",
      tiktokUrl: "",
      websiteUrl: "",
    }
  ]
};

// ─── Icon components ─────────────────────────────────────────────────────────

const S = 18; // icon size px

const TwitterIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const TikTokIcon = () => (
  <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.31 6.31 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.79a4.85 4.85 0 01-1.02-.1z" />
  </svg>
);

// Renders the icon for a given platform
const PlatformIcon = component$<{ platform: string }>(({ platform }) => {
  switch (platform) {
    case 'twitter':   return <TwitterIcon />;
    case 'linkedin':  return <LinkedInIcon />;
    case 'instagram': return <LuInstagram width={S} height={S} />;
    case 'youtube':   return <LuYoutube   width={S} height={S} />;
    case 'facebook':  return <LuFacebook  width={S} height={S} />;
    case 'github':    return <LuGithub    width={S} height={S} />;
    case 'tiktok':    return <TikTokIcon />;
    default:          return <LuGlobe     width={S} height={S} />;
  }
});

// ─── Main section ─────────────────────────────────────────────────────────────
export const PeopleSection = component$<PeopleSectionProps>(({ data, order, editable = false }) => {
  const peopleSectionStyle = `display: flex; justify-content: center; width: 100%; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;

  const cardBg  = data.cardBgColor || 'var(--surface-1)';
  const nameClr = data.nameColor   || 'var(--text-primary)';
  const bioClr  = data.bioColor    || 'var(--text-secondary)';
  const iconClr = data.iconColor   || 'var(--text-secondary)';

  const people = (Array.isArray(data.people) && data.people.length > 0)
    ? data.people
    : (editable ? PeopleSectionDefaultData.people : []);

  return (
    <section class="page-people-section" style={`${peopleSectionStyle} order: ${order};`}>
      <style>{`
        .page-people-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: ${spacing.md};
          width: 100%;
        }
        @media (max-width: 1024px) {
          .page-people-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (max-width: 768px) {
          .page-people-section {
            padding: 2.5rem 1rem !important;
          }
          .page-people-title {
            font-size: 1.85rem !important;
          }
          .page-people-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 1rem !important;
          }
        }
      `}</style>
      <div style={`width: 100%; max-width: 77.5rem; display: flex; flex-direction: column; gap: ${spacing.md}; align-items: center; text-align: center;`}>

        {/* Section header */}
        {(data.title || data.description || data.note || editable) && (
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; text-align: center; align-items: center;`}>
            {(data.title || editable) && (
              <h2
                class="page-people-title"
                data-field="title"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`margin: 0; font-size: 2.5rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.title || "Meet the Team"}
              </h2>
            )}
            {(data.description || editable) && (
              <p
                data-field="description"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`margin: 0; font-size: 1rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.description || "Description"}
              </p>
            )}
            {(data.note || editable) && (
              <p
                data-field="note"
                contentEditable={editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`margin: 0; font-size: 0.875rem; color: ${data.noteColor || 'var(--text-secondary)'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
              >
                {data.note || "Note"}
              </p>
            )}
          </div>
        )}

        {/* People grid */}
        <div class="page-people-grid">
          {people.map((person: any, index: number) => {
            const activeSocials = SOCIAL_PLATFORMS.filter(p => !!person[p.key]);

            return (
              <div
                key={`person-${index}`}
                data-element-type={editable ? "box" : undefined}
                data-color-field="cardBgColor"
                data-current-color={cardBg}
                data-default-bg="var(--surface-1)"
                style={`display: flex; flex-direction: column; gap: 0; padding: 0; border-radius: ${borderRadius.md}; border: 1px solid var(--border); background: ${cardBg}; overflow: hidden; text-align: left;`}
              >
                {(person.image_url || editable) && (
                  <img
                    data-field={`people.${index}.image_url`}
                    data-element-type="image"
                    src={person.image_url || "https://placehold.co/320x320?text=Image"}
                    alt={person.name ?? `Person ${index + 1}`}
                    width={320} height={320}
                    style={`width: 100%; height: 240px; object-fit: cover; border-radius: 0; display: block; cursor: ${editable ? 'pointer' : 'default'}`}
                  />
                )}

                <div style="display: flex; flex-direction: column; gap: 0.25rem; padding: 0.625rem 0.75rem; text-align: left; align-items: flex-start; width: 100%; box-sizing: border-box;">
                  {(person.name || editable) && (
                    <h3
                      data-field={`people.${index}.name`}
                      contentEditable={editable ? "true" : undefined}
                      data-default-color="var(--text-primary)"
                      style={`margin: 0; font-size: 1.05rem; font-weight: ${data.nameWeight || '600'}; color: ${person.nameColor || nameClr}; text-align: left; cursor: ${editable ? 'text' : 'default'}`}
                    >
                      {person.name || "Name"}
                    </h3>
                  )}

                  {(person.bio || editable) && (
                    <p
                      data-field={`people.${index}.bio`}
                      contentEditable={editable ? "true" : undefined}
                      data-default-color="var(--text-secondary)"
                      style={`margin: 0; font-size: 0.85rem; color: ${person.bioColor || bioClr}; line-height: 1.5; text-align: left; cursor: ${editable ? 'text' : 'default'}`}
                    >
                      {person.bio || "Bio / Role"}
                    </p>
                  )}

                  {/* Social icons row */}
                  {(activeSocials.length > 0 || editable) && (
                    <div style="display: flex; align-items: center; justify-content: flex-start; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.125rem;">
                      {activeSocials.map(p => (
                        editable ? (
                          <span
                            key={p.key}
                            title={p.platform}
                            style={`display: inline-flex; color: ${iconClr}; opacity: 0.85;`}
                          >
                            <PlatformIcon platform={p.platform} />
                          </span>
                        ) : (
                          <a
                            key={p.key}
                            href={person[p.key]}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={p.platform}
                            style={`display: inline-flex; color: ${iconClr}; text-decoration: none; transition: opacity 0.15s;`}
                          >
                            <PlatformIcon platform={p.platform} />
                          </a>
                        )
                      ))}
                      {editable && (
                        <span
                          data-field="icon"
                          data-default-color="var(--text-secondary)"
                          style={`font-size: 0.7rem; color: ${iconClr}; opacity: 0.55; cursor: text; user-select: none; margin-left: 2px;`}
                        >
                          icon color
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
});
