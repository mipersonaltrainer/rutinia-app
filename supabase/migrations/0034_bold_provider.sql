-- Bold (Colombia, COP) becomes the peso provider. Wompi stays in the enum so past payments keep their provider and late Wompi webhooks still settle.
-- ADD VALUE cannot be used in the same transaction, so nothing here refers to 'bold'; the settle_* functions take the enum as a parameter and need no change.
alter type payment_provider add value if not exists 'bold';
