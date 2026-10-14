import { z } from "zod";

/** What every inquiry carries besides its form fields: where the lead came from. */
export const SourceSchema = z.object({
  landingPage: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  gclid: z.string().max(300).optional(),
  gbraid: z.string().max(300).optional(),
  fbclid: z.string().max(300).optional(),
  msclkid: z.string().max(300).optional(),
  submittedFrom: z.string().max(500).optional(),
});

const email = z.string().trim().email("Enter a valid email address").max(120);
const name = z.string().trim().min(2, "Enter your name").max(80);
const phone = z.string().trim().max(30).optional().or(z.literal(""));
const company = z.string().trim().max(120).optional().or(z.literal(""));

export const InquirySchema = z.discriminatedUnion("form", [
  z.object({ form: z.literal("contact"), name, email, phone, company, message: z.string().trim().min(10, "Tell us a little more").max(3000) }),
  z.object({
    form: z.literal("quote"),
    name, email, phone,
    company: z.string().trim().min(2, "Enter your company").max(120),
    service: z.enum(["Private Label", "Custom Formulation", "Bulk & Wholesale", "Not sure yet"]),
    product: z.string().max(200).optional().or(z.literal("")),
    quantity: z.string().max(40),
    timeline: z.string().max(40),
    message: z.string().trim().max(3000).optional().or(z.literal("")),
  }),
  z.object({
    form: z.literal("sample"),
    name, email, phone, company,
    products: z.array(z.string().max(80)).min(1, "Choose at least one formula").max(5, "Choose up to five formulas"),
    street: z.string().trim().min(3, "Enter a street address").max(120),
    city: z.string().trim().min(2, "Enter a city").max(60),
    state: z.string().trim().regex(/^[A-Za-z]{2}$/, "Use the 2-letter state code"),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  }),
  z.object({
    form: z.literal("project"),
    name, email, phone,
    company: z.string().trim().min(2, "Enter your company").max(120),
    productType: z.string().min(1).max(60),
    description: z.string().trim().min(20, "Describe the product in a sentence or two").max(3000),
    quantity: z.string().max(40),
    timeline: z.string().max(40),
    budget: z.string().max(40),
    attachments: z.array(z.string().max(200)).max(5).optional(),
  }),
  z.object({ form: z.literal("spec_sheet"), email, company, product: z.string().max(80).optional() }),
]);

export const InquiryEnvelope = z.object({
  inquiry: InquirySchema,
  source: SourceSchema.default({}),
  marketingConsent: z.boolean().default(false),
  /** Honeypot: real people never see or fill this field. Filled = stored as spam, silently. */
  website: z.string().max(500).optional(),
  /** Milliseconds the form was open; bots submit instantly. */
  elapsedMs: z.number().int().nonnegative().optional(),
  /** Cloudflare Turnstile token, when the platform has a site key configured. */
  turnstileToken: z.string().max(4096).optional(),
});

export type Inquiry = z.infer<typeof InquirySchema>;
export type InquiryForm = Inquiry["form"];
