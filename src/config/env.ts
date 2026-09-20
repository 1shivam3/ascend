import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_ANON_KEY: z.string().min(1).default('placeholder-anon-key-local-development'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ENABLE_ANALYTICS: z.boolean().default(false),
});

export type EnvConfig = z.infer<typeof envSchema>;

const rawEnv = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key-local-development',
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  ENABLE_ANALYTICS: process.env.EXPO_PUBLIC_ENABLE_ANALYTICS === 'true',
};

export const ENV: EnvConfig = envSchema.parse(rawEnv);
