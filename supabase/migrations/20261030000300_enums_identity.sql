-- Enums for the identity domain.
create type public.app_role as enum ('client', 'freelancer', 'admin');
create type public.availability_status as enum ('available', 'busy', 'unavailable');
create type public.kyc_status as enum ('pending', 'approved', 'rejected');
create type public.kyc_doc_type as enum ('pan', 'aadhaar');
create type public.portfolio_kind as enum ('link', 'file', 'image');
