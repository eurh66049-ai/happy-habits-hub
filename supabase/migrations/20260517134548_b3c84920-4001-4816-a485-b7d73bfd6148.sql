-- Remove duplicate triggers/functions that insert the same notification twice
DROP TRIGGER IF EXISTS on_message_request_created ON public.message_requests;
DROP TRIGGER IF EXISTS on_message_request_responded ON public.message_requests;
DROP FUNCTION IF EXISTS public.notify_message_request();
DROP FUNCTION IF EXISTS public.notify_message_request_response();