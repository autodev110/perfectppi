import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Warranty Queries — Phase D
// All functions return typed data or null. Never throw to the client.
// ============================================================================

export interface WarrantyPlan {
  name: string;
  term_years: number;
  term_miles: number | null;
  price_cents: number;
  inclusions: string[];
  exclusions: string[];
  deductible_cents: number;
}

export interface WarrantyOption {
  id: string;
  vsc_output_id: string;
  vehicle_id: string;
  user_id: string;
  plans: WarrantyPlan[];
  status: string;
  offered_at: string | null;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyOrder {
  id: string;
  warranty_option_id: string;
  plan_name: string;
  term_years: number;
  term_miles: number | null;
  price_cents: number;
  status: string;
  selected_at: string;
  updated_at: string;
}

export interface WarrantyContract {
  id: string;
  warranty_order_id: string;
  document_url: string | null;
  docuseal_id: string | null;
  docuseal_submitter_slug: string | null;
  presented_at: string;
  signed_at: string | null;
  signer_id: string;
  created_at: string;
}

export interface WarrantyPayment {
  id: string;
  contract_id: string;
  user_id: string;
  amount_cents: number;
  method: string;
  stripe_payment_id: string | null;
  status: string;
  receipt_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface FullWarrantyFlow {
  option: WarrantyOption;
  order: WarrantyOrder | null;
  contract: WarrantyContract | null;
  payment: WarrantyPayment | null;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
  } | null;
}

/** Get warranty options for a given VSC output — returns null if not yet generated */
export async function getWarrantyOptionByVscOutput(
  vscOutputId: string,
): Promise<WarrantyOption | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_options")
    .select("*")
    .eq("vsc_output_id", vscOutputId)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyOption | null;
}

/** Get a warranty option by its ID */
export async function getWarrantyOption(id: string): Promise<WarrantyOption | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_options")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyOption | null;
}

/** Get a warranty order by ID */
export async function getWarrantyOrder(orderId: string): Promise<WarrantyOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyOrder | null;
}

/** Get the order for a warranty option */
export async function getOrderByOptionId(optionId: string): Promise<WarrantyOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warranty_orders")
    .select("*")
    .eq("warranty_option_id", optionId)
    .order("selected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyOrder | null;
}

/** Get contract by order ID */
export async function getContractByOrderId(orderId: string): Promise<WarrantyContract | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("warranty_order_id", orderId)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyContract | null;
}

/** Get payment by contract ID */
export async function getPaymentByContractId(contractId: string): Promise<WarrantyPayment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("contract_id", contractId)
    .maybeSingle();

  if (error) return null;
  return data as WarrantyPayment | null;
}

/**
 * Fetch the full warranty flow for a given warranty_option.id.
 * Returns all related records in one pass.
 */
export async function getFullWarrantyFlow(optionId: string): Promise<FullWarrantyFlow | null> {
  const supabase = await createClient();

  const { data: option, error: optErr } = await supabase
    .from("warranty_options")
    .select("*")
    .eq("id", optionId)
    .maybeSingle();

  if (optErr || !option) return null;

  // Fetch vehicle separately to avoid FK relationship requirement
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, year, make, model, trim, vin")
    .eq("id", option.vehicle_id)
    .maybeSingle();

  const { data: order } = await supabase
    .from("warranty_orders")
    .select("*")
    .eq("warranty_option_id", optionId)
    .order("selected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let contract: WarrantyContract | null = null;
  let payment: WarrantyPayment | null = null;

  if (order) {
    const { data: c } = await supabase
      .from("contracts")
      .select("*")
      .eq("warranty_order_id", order.id)
      .maybeSingle();
    contract = c as WarrantyContract | null;

    if (contract) {
      const { data: p } = await supabase
        .from("payments")
        .select("*")
        .eq("contract_id", contract.id)
        .maybeSingle();
      payment = p as WarrantyPayment | null;
    }
  }

  return {
    option: {
      id: option.id,
      vsc_output_id: option.vsc_output_id,
      vehicle_id: option.vehicle_id,
      user_id: option.user_id,
      plans: (option.plans as unknown as WarrantyPlan[]) ?? [],
      status: option.status,
      offered_at: option.offered_at,
      viewed_at: option.viewed_at,
      created_at: option.created_at,
      updated_at: option.updated_at,
    },
    order: order as WarrantyOrder | null,
    contract,
    payment,
    vehicle: vehicle ?? null,
  };
}

/** List all warranty options for the current user (for /dashboard/warranty) */
export async function getMyWarranties(): Promise<
  Array<{
    option: WarrantyOption;
    order: WarrantyOrder | null;
    vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return [];

  const { data: options, error } = await supabase
    .from("warranty_options")
    .select("*")
    .eq("user_id", profile.id)
    .neq("status", "not_offered")
    .order("created_at", { ascending: false });

  if (error || !options) return [];

  const results = await Promise.all(
    options.map(async (opt) => {
      const [{ data: order }, { data: vehicle }] = await Promise.all([
        supabase
          .from("warranty_orders")
          .select("*")
          .eq("warranty_option_id", opt.id)
          .order("selected_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("vehicles")
          .select("year, make, model, trim")
          .eq("id", opt.vehicle_id)
          .maybeSingle(),
      ]);

      return {
        option: {
          id: opt.id,
          vsc_output_id: opt.vsc_output_id,
          vehicle_id: opt.vehicle_id,
          user_id: opt.user_id,
          plans: (opt.plans as unknown as WarrantyPlan[]) ?? [],
          status: opt.status,
          offered_at: opt.offered_at,
          viewed_at: opt.viewed_at,
          created_at: opt.created_at,
          updated_at: opt.updated_at,
        },
        order: order as WarrantyOrder | null,
        vehicle: vehicle ?? null,
      };
    }),
  );

  return results;
}

export interface PublicVehicleWarrantySnapshot {
  option: WarrantyOption;
  order: WarrantyOrder | null;
  contract: WarrantyContract | null;
  payment: WarrantyPayment | null;
}

/** Public read model for /vehicle/[id]?tab=warranty */
export async function getPublicVehicleWarrantySnapshot(
  vehicleId: string,
): Promise<PublicVehicleWarrantySnapshot | null> {
  const admin = createAdminClient();

  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, visibility")
    .eq("id", vehicleId)
    .maybeSingle();

  if (!vehicle || vehicle.visibility !== "public") return null;

  const { data: option } = await admin
    .from("warranty_options")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .neq("status", "not_offered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!option) return null;

  const { data: order } = await admin
    .from("warranty_orders")
    .select("*")
    .eq("warranty_option_id", option.id)
    .order("selected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let contract: WarrantyContract | null = null;
  let payment: WarrantyPayment | null = null;

  if (order) {
    const { data: c } = await admin
      .from("contracts")
      .select("*")
      .eq("warranty_order_id", order.id)
      .maybeSingle();
    contract = c as WarrantyContract | null;

    if (contract) {
      const { data: p } = await admin
        .from("payments")
        .select("*")
        .eq("contract_id", contract.id)
        .maybeSingle();
      payment = p as WarrantyPayment | null;
    }
  }

  return {
    option: {
      id: option.id,
      vsc_output_id: option.vsc_output_id,
      vehicle_id: option.vehicle_id,
      user_id: option.user_id,
      plans: (option.plans as unknown as WarrantyPlan[]) ?? [],
      status: option.status,
      offered_at: option.offered_at,
      viewed_at: option.viewed_at,
      created_at: option.created_at,
      updated_at: option.updated_at,
    },
    order: order as WarrantyOrder | null,
    contract,
    payment,
  };
}
