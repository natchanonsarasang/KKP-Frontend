-- Add phone_number column to call_list_items
ALTER TABLE call_list_items ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Update existing records with phone numbers from debtors table
UPDATE call_list_items cli
SET phone_number = d.phone_number
FROM debtors d
WHERE cli.debtor_id = d.id
AND cli.phone_number IS NULL;
