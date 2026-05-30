-- Give admin 900,000 coins to test features
INSERT INTO public.user_gamification (user_id, coins, xp)
VALUES ('47fb0419-0273-4756-aa10-b9c03041fe2c', 900000, 0)
ON CONFLICT (user_id) DO UPDATE SET coins = 900000;

-- Link the admin_users row to its auth user
UPDATE public.admin_users
SET user_id = '47fb0419-0273-4756-aa10-b9c03041fe2c'
WHERE email = 'adilelbourachdi397@gmail.com' AND user_id IS NULL;