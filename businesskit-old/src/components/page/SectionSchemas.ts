import { FeaturedSectionSchema, FeaturedSectionDefaultData } from "~/components/pagex/FeaturedSection";
import { HeroSectionSchema, HeroSectionDefaultData } from "~/components/pagex/HeroSection";
import { PricingSectionSchema, PricingSectionDefaultData } from "~/components/pagex/PricingSection";
import { FaqSectionSchema, FaqSectionDefaultData } from "~/components/pagex/FaqSection";
import { AboutSectionSchema, AboutSectionDefaultData } from "~/components/pagex/AboutSection";
import { CurriculumSectionSchema, CurriculumSectionDefaultData } from "~/components/pagex/CurriculumSection";
import { TestimonialsSectionSchema, TestimonialsSectionDefaultData } from "~/components/pagex/TestimonialsSection";
import { IntroSectionSchema, IntroSectionDefaultData } from "~/components/pagex/IntroSection";
import { PeopleSectionSchema, PeopleSectionDefaultData } from "~/components/pagex/PeopleSection";
import { CtaSectionSchema, CtaSectionDefaultData } from "~/components/pagex/CtaSection";
import { TextSectionSchema, TextSectionDefaultData } from "~/components/pagex/TextSection";
import { TextLeftSectionSchema, TextLeftSectionDefaultData } from "~/components/pagex/TextLeftSection";
import { ShowLinksSchema, ShowLinksDefaultData } from "~/components/pagex/ShowLinks";
import { ShowLinksCentredSchema, ShowLinksCentredDefaultData } from "~/components/pagex/ShowLinksCentred";
import { HeroSliderSectionSchema, HeroSliderSectionDefaultData } from "~/components/pagex/HeroSliderSection";
import { HeroSliderSection2Schema, HeroSliderSection2DefaultData } from "~/components/pagex/HeroSliderSection2";

export const ComponentSchemas: Record<string, any[]> = {
  featured: FeaturedSectionSchema,
  hero_section: HeroSectionSchema,
  heroSection: HeroSectionSchema,
  pricing: PricingSectionSchema,
  faq: FaqSectionSchema,
  about_section: AboutSectionSchema,
  aboutSection: AboutSectionSchema,
  curriculum: CurriculumSectionSchema,
  testimonials: TestimonialsSectionSchema,
  intro: IntroSectionSchema,
  people_section: PeopleSectionSchema,
  peopleSection: PeopleSectionSchema,
  cta_section: CtaSectionSchema,
  ctaSection: CtaSectionSchema,
  text: TextSectionSchema,
  textField: TextSectionSchema,
  text_left: TextLeftSectionSchema,
  textLeft: TextLeftSectionSchema,
  show_links: ShowLinksSchema,
  showLinks: ShowLinksSchema,
  show_links_centred: ShowLinksCentredSchema,
  showLinksCentred: ShowLinksCentredSchema,
  hero_slider: HeroSliderSectionSchema,
  heroSlider: HeroSliderSectionSchema,
  hero_slider_2: HeroSliderSection2Schema,
  heroSlider2: HeroSliderSection2Schema,
};

export const ComponentDefaultData: Record<string, any> = {
  featured: FeaturedSectionDefaultData,
  hero_section: HeroSectionDefaultData,
  heroSection: HeroSectionDefaultData,
  pricing: PricingSectionDefaultData,
  faq: FaqSectionDefaultData,
  about_section: AboutSectionDefaultData,
  aboutSection: AboutSectionDefaultData,
  curriculum: CurriculumSectionDefaultData,
  testimonials: TestimonialsSectionDefaultData,
  intro: IntroSectionDefaultData,
  people_section: PeopleSectionDefaultData,
  peopleSection: PeopleSectionDefaultData,
  cta_section: CtaSectionDefaultData,
  ctaSection: CtaSectionDefaultData,
  text: TextSectionDefaultData,
  textField: TextSectionDefaultData,
  text_left: TextLeftSectionDefaultData,
  textLeft: TextLeftSectionDefaultData,
  show_links: ShowLinksDefaultData,
  showLinks: ShowLinksDefaultData,
  show_links_centred: ShowLinksCentredDefaultData,
  showLinksCentred: ShowLinksCentredDefaultData,
  hero_slider: HeroSliderSectionDefaultData,
  heroSlider: HeroSliderSectionDefaultData,
  hero_slider_2: HeroSliderSection2DefaultData,
  heroSlider2: HeroSliderSection2DefaultData,
};
