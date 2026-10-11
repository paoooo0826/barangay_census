-- Restore the confirmed approved rates for future requests.
-- Keep existing request fees, paid receipts, and the first Low Income exemption.
update public.service_catalog set base_fee=230,student_fee=130 where code='barangay_clearance';
update public.service_catalog set base_fee=30,student_fee=null where code='certificate_of_residency';
