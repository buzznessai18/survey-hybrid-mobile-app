#!/usr/bin/env bash
# Creates the three demo field survey users that "collect" the Goa demo data.
# Random passwords are generated and NOT printed: nobody signs in as them.
# Usage: SUPABASE_URL=https://<ref>.supabase.co SERVICE_ROLE_KEY=<key> ./create_demo_accounts.sh
#        (the service key stays in your terminal; never put it in the app)
set -euo pipefail
: "${SUPABASE_URL:?}" "${SERVICE_ROLE_KEY:?}"

for entry in "pratik.naik:Pratik Naik" "sneha.kamat:Sneha Kamat" "rohan.fernandes:Rohan Fernandes"; do
  email="${entry%%:*}@fieldsurvey.app"; name="${entry#*:}"
  pw="Demo-$(openssl rand -hex 12)!"
  id=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$name\"}}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
  if [ -z "$id" ]; then echo "exists or failed: $email"; continue; fi
  curl -s -o /dev/null -X PATCH "$SUPABASE_URL/rest/v1/profiles?id=eq.$id" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d '{"role":"user","status":"active"}'
  echo "created: $name <$email>"
done
