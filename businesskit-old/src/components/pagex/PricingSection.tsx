import { component$ } from "@builder.io/qwik";
import { LuShieldCheck } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius } = designSystem;

export interface PricingSectionProps {
  data: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const PricingSectionSchema = [
  { name: 'title', label: 'Section Title', type: 'text' },
  { name: 'description', label: 'Section Description', type: 'text' },
  {
    name: 'plans',
    label: 'Pricing Plans',
    type: 'array',
    fields: [
      { name: 'offer', label: 'Highlight Offer (e.g. SAVE 20%)', type: 'text' },
      { name: 'title', label: 'Plan Title', type: 'text' },
      { name: 'description', label: 'Plan Description', type: 'text' },
      { name: 'scarcity', label: 'Scarcity Text', type: 'text' },
      { name: 'price', label: 'Original Price (Strikethrough)', type: 'text' },
      { name: 'sale_price', label: 'Sale Price', type: 'text' },
      { name: 'price_text', label: 'Text next to price', type: 'text' },
      { name: 'cta_text', label: 'Button Text', type: 'text' },
      { name: 'cta_url', label: 'Button Link', type: 'text' }
    ]
  },
  {
    name: 'safePurchase',
    label: 'Safe Purchase Banner',
    type: 'object',
    fields: [
      { name: 'text', label: 'Text', type: 'text' },
      { name: 'imageUrl', label: 'Image URL', type: 'text' }
    ]
  },
  {
    name: 'unsure',
    label: 'Unsure Section',
    type: 'object',
    fields: [
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'buttonText', label: 'Button Text', type: 'text' },
      { name: 'buttonUrl', label: 'Button Link', type: 'text' }
    ]
  },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' }
];

export const PricingSectionDefaultData = {
  title: "Pricing",
  description: "Choose the plan that fits you best.",
  plans: [
    {
      offer: "SAVE 20%",
      title: "Signature Brand",
      description: "4-week live coaching program",
      scarcity: "Only 50 spots available - closes 2nd February",
      price: "$2400",
      sale_price: "$1900",
      price_text: "Today's price only",
      features: [{ key: "Sessions", value: "Live sessions" }],
      cta_text: "Get Access",
      cta_url: "#",
    }
  ],
  safePurchase: { text: "100% Safe Purchase", imageUrl: "https://d1pvzhmgnzglln.cloudfront.net/9037489b-0584-4c32-82a3-b08a9bcbaa58/01KE7VBYCDVWE9W0YQ1SAGG9M7/Container.png" },
  unsure: {
    title: "I feel unsure if this is for me?",
    description: "no problem, please book a call with my team below",
    buttonText: "BOOK A CALL",
    buttonUrl: "#"
  }
};

export const PricingSection = component$<PricingSectionProps>(({ data, order, editable = false }) => {
  const fullBleedWidth = "100%";
  const pricingSectionStyle = `display: flex; flex-direction: column; gap: ${spacing.sm}; width: ${fullBleedWidth}; margin: 0 auto; padding: 4rem 1rem; box-sizing: border-box; background: ${data?.bgColor || 'var(--surface-2)'};`;
  const sectionHeaderStyle = `display: flex; flex-direction: column; gap: ${spacing.xs};`;

  return (
    <section class="page-pricing-section" style={`${pricingSectionStyle} order: ${order};`}>
      {(data.title || data.description || editable) && (
        <div style={`${sectionHeaderStyle} align-items: center; text-align: center;`}>
          {(data.title || editable) && (
            <h2
              data-field="title"
              contentEditable={editable ? "true" : undefined}
              data-default-color="var(--text-primary)"
              style={`margin: 0; font-size: 2.25rem; font-weight: ${data.titleWeight || '600'}; font-style: ${data.titleStyle || 'normal'}; color: ${data.titleColor || 'var(--text-primary)'}; background: ${data.titleHighlight || 'transparent'}; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}
            >
              {data.title || "Pricing"}
            </h2>
          )}
          {(data.description || editable) && (
            <p
              data-field="description"
              contentEditable={editable ? "true" : undefined}
              data-default-color="var(--text-secondary)"
              style={`margin: 0 0 1rem; font-size: 0.875rem; font-weight: ${data.descriptionWeight || '400'}; font-style: ${data.descriptionStyle || 'normal'}; color: ${data.descriptionColor || 'var(--text-secondary)'}; background: ${data.descriptionHighlight || 'transparent'}; line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}
            >
              {data.description || "Description"}
            </p>
          )}
        </div>
      )}
      <div style={`display: flex; flex-direction: column; gap: 1rem; width: 100%; align-items: center;`}>
        {((Array.isArray(data.plans) && data.plans.length > 0) ? data.plans : (editable ? PricingSectionDefaultData.plans : [])).map((item: any, index: number) => (
          <div class="page-pricing-card" key={`pricing-${index}`} style={`display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 36rem; padding: ${spacing.md}; box-sizing: border-box; border-radius: ${borderRadius.md}; border: 1px solid var(--border); background: var(--surface-1); text-align: left;`}>
            <div class="page-pricing-main" style={`display: flex; flex-direction: column; gap: 0.5rem;`}>
              {(item.offer || editable) && <span data-field={`plans.${index}.offer`} contentEditable={editable ? "true" : undefined} data-default-color="var(--text-primary)" style={`display: inline-flex; width: fit-content; padding: 0.25rem 0.5rem; border-radius: ${borderRadius.sm}; background: var(--surface-2); font-size: 1.25rem; font-weight: 900; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}>{item.offer || "SAVE 20%"}</span>}
              <h3 data-field={`plans.${index}.title`} contentEditable={editable ? "true" : undefined} data-default-color="var(--text-primary)" style={`margin: 0; font-size: 1.5rem; font-weight: 900; line-height: 1.2; cursor: ${editable ? 'text' : 'default'}`}>{item.title ?? `Plan ${index + 1}`}</h3>
              {(item.description || editable) && <p data-field={`plans.${index}.description`} contentEditable={editable ? "true" : undefined} data-default-color="var(--text-secondary)" style={`margin: 0; font-size: 1rem; font-weight: 400; color: var(--text-secondary); line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}>{item.description || "Description"}</p>}
              {(item.scarcity || editable) && <p data-field={`plans.${index}.scarcity`} contentEditable={editable ? "true" : undefined} data-default-color="var(--text-secondary)" style={`display: inline-flex; width: fit-content; margin: 0; padding: 0.25rem 0.5rem; border-radius: ${borderRadius.sm}; background: var(--surface-2); font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); line-height: 1.4; cursor: ${editable ? 'text' : 'default'}`}>{item.scarcity || "Only 50 spots"}</p>}
              <div style={`display: inline-flex; align-items: flex-end; gap: 0.5rem; width: fit-content; margin: 1rem 0;`}>
                {(item.price || editable) && <span data-field={`plans.${index}.price`} contentEditable={editable ? "true" : undefined} style={`font-size: 1.25rem; font-weight: 400; line-height: 1.2; color: var(--text-secondary); text-decoration: line-through; cursor: ${editable ? 'text' : 'default'}`}>{item.price || "$200"}</span>}
                {(item.sale_price || editable) && <span data-field={`plans.${index}.sale_price`} contentEditable={editable ? "true" : undefined} style={`font-size: 2.25rem; font-weight: 600; line-height: 1.1; color: var(--text-primary); cursor: ${editable ? 'text' : 'default'}`}>{item.sale_price || "$100"}</span>}
                {(item.price_text || editable) && <span data-field={`plans.${index}.price_text`} contentEditable={editable ? "true" : undefined} class="page-pricing-price-text" style={`display: inline-flex; align-items: center; gap: 0.375rem; font-size: 1rem; font-weight: 700; color: var(--text-primary); line-height: 1.4; cursor: ${editable ? 'text' : 'default'}`}>{item.price_text || "/month"}</span>}
              </div>
            </div>
            {Array.isArray(item.features) && item.features.length > 0 && (
              <div class="page-pricing-features" style={`display: flex; flex-direction: column; gap: 1rem;`}>
                {item.features.map((feature: any, featureIndex: number) => (
                  <p key={`feature-${index}-${featureIndex}`} style={`margin: 0; font-size: 0.875rem; line-height: 1.5; color: var(--text-primary);`}><span data-field={`plans.${index}.features.${featureIndex}.key`} contentEditable={editable ? "true" : undefined} style={`font-weight: 500; color: var(--text-primary); cursor: ${editable ? 'text' : 'default'}`}>{feature.key}</span>: <span data-field={`plans.${index}.features.${featureIndex}.value`} contentEditable={editable ? "true" : undefined} style={`font-weight: 400; color: var(--text-primary); cursor: ${editable ? 'text' : 'default'}`}>{feature.value}</span></p>
                ))}
              </div>
            )}
            {(item.cta_text || editable) && (
              <a
                data-field={`plans.${index}.cta_text`}
                data-element-type="button"
                data-link-field={`plans.${index}.cta_url`}
                data-color-field={`plans.${index}.cta_color`}
                data-current-color={(item as any).cta_color || "var(--accent)"}
                data-default-color="var(--surface-1)"
                data-default-bg="var(--accent)"
                contentEditable={editable ? "true" : undefined}
                href={!editable ? (item.cta_url ?? "#") : "#"}
                onClick$={(e) => editable && e.preventDefault()}
                style={`display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 3.125rem; margin-top: 1rem; padding: 0 ${spacing.md}; box-sizing: border-box; border-radius: ${borderRadius.md}; background: ${(item as any).cta_color || "var(--accent)"}; color: ${(item as any).cta_textColor || "var(--surface-1)"}; text-decoration: none; font-size: 1rem; font-weight: 600; cursor: ${editable ? 'text' : 'pointer'}`}
              >
                {item.cta_text || "Click Here"}
              </a>
            )}
          </div>
        ))}
      </div>
      {(data.safePurchase || editable) && (
        <div style={`display: flex; flex-direction: column; gap: 1rem; width: 100%; margin: 1rem auto 0; align-items: center; text-align: center;`}>
          {(data.safePurchase?.text || editable) && <p data-field="safePurchase.text" contentEditable={editable ? "true" : undefined} style={`margin: 0; display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; font-size: 0.875rem; font-weight: 400; color: var(--text-secondary); line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}><LuShieldCheck width={14} height={14} />{data.safePurchase?.text || "100% Safe Purchase"}</p>}
          {(data.safePurchase?.imageUrl || editable) && <img data-field="safePurchase.imageUrl" data-element-type="image" src={data.safePurchase?.imageUrl || "https://placehold.co/640x30?text=Secure"} alt="Safe purchase" width={640} height={30} style={`width: auto; max-width: 100%; height: 1.875rem; object-fit: contain; cursor: ${editable ? 'pointer' : 'default'}`} />}
        </div>
      )}
      {(data.unsure || editable) && (
        <div style={`display: flex; flex-direction: column; gap: 1rem; width: 100%; margin: 5rem auto 0; text-align: center; align-items: center;`}>
          <div style={`display: flex; flex-direction: column; gap: 0.5rem; align-items: center;`}>
            {(data.unsure?.title || editable) && <h3 data-field="unsure.title" contentEditable={editable ? "true" : undefined} style={`margin: 0; font-size: 1.875rem; font-weight: 900; line-height: 1.2; font-family: 'Playfair Display', serif; font-style: italic; cursor: ${editable ? 'text' : 'default'}`}>{data.unsure?.title || "I feel unsure if this is for me?"}</h3>}
            {(data.unsure?.description || editable) && <p data-field="unsure.description" contentEditable={editable ? "true" : undefined} style={`margin: 0; font-size: 1rem; font-weight: 400; color: var(--text-secondary); line-height: 1.6; cursor: ${editable ? 'text' : 'default'}`}>{data.unsure?.description || "no problem"}</p>}
          </div>
          <div style={`display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;`}>
            <a
            data-field="unsure.buttonText"
            data-element-type="button"
            data-link-field="unsure.buttonUrl"
            data-color-field="unsure.buttonColor"
            data-current-color={(data.unsure as any)?.buttonColor || "var(--accent)"}
            data-default-color="var(--surface-1)"
            data-default-bg="var(--accent)"
            contentEditable={editable ? "true" : undefined}
            href={!editable ? (data.unsure?.buttonUrl ?? "#") : "#"}
            onClick$={(e) => editable && e.preventDefault()}
            style={`display: inline-flex; width: 12.5rem; min-width: 12.5rem; max-width: 12.5rem; align-items: center; justify-content: center; height: 3.125rem; padding: 0; box-sizing: border-box; border-radius: 1.5rem; background: ${(data.unsure as any)?.buttonColor || "var(--accent)"}; color: ${(data.unsure as any)?.buttonTextColor || "var(--surface-1)"}; text-decoration: none; font-size: 1rem; font-weight: 600; overflow: hidden; cursor: ${editable ? 'text' : 'pointer'}`}
          >
              <span style={`white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; padding: 0 1rem;`}>{data.unsure?.buttonText || "I'm not sure yet"}</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
});
