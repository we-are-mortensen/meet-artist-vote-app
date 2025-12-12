import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://isghotnbpvxswndongod.supabase.co";
const supabaseKey = "sb_publishable_YxvLPlhml-aLDernspfsLg_y2KRlUWy";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
