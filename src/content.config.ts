import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const work = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string(),
    summary: z.string(),
    order: z.number(),
    period: z.string(),
    role: z.string(),
    stack: z.array(z.string()),
    metrics: z.array(z.object({ value: z.string(), label: z.string() })),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    featured: z.boolean().default(false),
  }),
});

export const collections = { work };
