import { component$ } from "@builder.io/qwik";
import { CoverImageSliderLeft } from "~/components/pagex/CoverImageSliderLeft";

export interface HeroSliderSection2Props {
  data?: any;
  images?: any;
  order: number;
  previewMode?: boolean;
  editable?: boolean;
  onUpdate$?: any;
}

export const HeroSliderSection2Schema = [
  {
    name: 'images',
    label: 'Slide Images',
    type: 'array',
    fields: [
      { name: 'imageUrl', label: 'Image URL (Desktop)', type: 'text' },
      { name: 'mobileImageUrl', label: '📱 Mobile Image URL (Optional)', type: 'text' },
      { name: 'url', label: 'Alt Image URL', type: 'text' },
      { name: 'h2', label: 'Slide Heading', type: 'text' },
      { name: 'h2Color', label: 'Heading Color', type: 'text' },
      { name: 'text', label: 'Subtitle', type: 'text' },
      { name: 'textColor', label: 'Subtitle Color', type: 'text' },
      { name: 'buttonText', label: 'Button Label', type: 'text' },
      { name: 'buttonUrl', label: 'Button Link', type: 'text' },
      { name: 'buttonTextColor', label: 'Button Text Color', type: 'text' },
      { name: 'buttonBgColor', label: 'Button Background Color', type: 'text' },
    ]
  },
  { name: 'bgColor', label: 'Section Background Color', type: 'text' }
];

export const HeroSliderSection2DefaultData = {
  images: [
    {
      imageUrl: "https://alphaleteathletics.com/cdn/shop/files/W_HP_16x9_73d1293c-1511-4a17-a215-8124dd63ad86.jpg",
      h2: "New Collection",
      text: "High performance apparel designed for movement.",
      buttonText: "Shop Collection",
      buttonUrl: "#"
    },
    {
      imageUrl: "https://alphaleteathletics.com/cdn/shop/files/HP_W_16x9_74642c26-2405-43e1-8175-a58b2bb099e6.jpg",
      h2: "Performance Gear",
      text: "Elevate your training with premium fabrics.",
      buttonText: "Explore Now",
      buttonUrl: "#"
    }
  ]
};

export const HeroSliderSection2 = component$<HeroSliderSection2Props>(({ data: inputData, images: inputImages, order, editable = false }) => {
  const rawData = inputData || inputImages;

  const data = (!rawData || (Array.isArray(rawData) ? rawData.length === 0 : Object.keys(rawData).length === 0))
    ? HeroSliderSection2DefaultData
    : rawData;

  const slideList = Array.isArray(data)
    ? data
    : (Array.isArray(data?.images) && data.images.length > 0)
    ? data.images
    : HeroSliderSection2DefaultData.images;

  return (
    <section
      class="public-page-slider-left"
      style={`order: ${order}; width: 100%; max-width: 100%; position: relative; border-radius: 0; overflow: hidden; background: ${data?.bgColor || 'var(--surface-2)'}; box-shadow: none; margin: 0 auto;`}
    >
      <style>{`
        .public-page-slider-left .landing-slider-left {
          border-radius: 0 !important;
          border: none !important;
        }
      `}</style>
      <CoverImageSliderLeft images={slideList} editable={editable} />
    </section>
  );
});
