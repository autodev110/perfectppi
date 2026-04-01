-- Warranty & Contracts: strict order offer → select → contract → sign → pay → receipt

CREATE TYPE warranty_status AS ENUM (
  'not_offered',
  'offered',
  'viewed',
  'selected',
  'contract_pending',
  'signed',
  'payment_pending',
  'paid',
  'failed',
  'cancelled'
);

CREATE TYPE payment_method AS ENUM (
  'card',
  'bank_transfer',
  'financing'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded'
);

CREATE TABLE warranty_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vsc_output_id uuid NOT NULL REFERENCES vsc_outputs(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plans jsonb NOT NULL DEFAULT '[]',
  status warranty_status NOT NULL DEFAULT 'not_offered',
  offered_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER warranty_options_updated_at
  BEFORE UPDATE ON warranty_options
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE warranty_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_option_id uuid NOT NULL REFERENCES warranty_options(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  term_years integer NOT NULL,
  term_miles integer,
  price_cents integer NOT NULL,
  status warranty_status NOT NULL DEFAULT 'contract_pending',
  selected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER warranty_orders_updated_at
  BEFORE UPDATE ON warranty_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_order_id uuid NOT NULL UNIQUE REFERENCES warranty_orders(id) ON DELETE CASCADE,
  document_url text,
  docuseal_id text,
  presented_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  signer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  method payment_method NOT NULL DEFAULT 'card',
  stripe_payment_id text,
  status payment_status NOT NULL DEFAULT 'pending',
  receipt_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
