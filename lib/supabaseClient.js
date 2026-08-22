import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Helpful message during local dev if the .env.local file is missing.
  console.warn(
    "Supabase env vars ontbreken. Kopieer .env.local.example naar .env.local en vul je project-gegevens in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
