# MikroTik RouterOS hotspot profile for Sriyan via FreeRADIUS.
# Replace FREERADIUS_IP, RADIUS_SHARED_SECRET, HTTPS_APP_DOMAIN, and interface names.

/radius
add service=hotspot address=FREERADIUS_IP secret=RADIUS_SHARED_SECRET authentication-port=1812 accounting-port=1813 timeout=3s accounting-backup=no

/ip hotspot profile
set [find name=default] use-radius=yes radius-accounting=yes radius-interim-update=1m login-by=http-chap,http-pap

/ip hotspot walled-garden
add dst-host=HTTPS_APP_DOMAIN action=allow comment="Allow Sriyan payment and OTP pages before auth"
add dst-host=checkout.razorpay.com action=allow comment="Allow Razorpay checkout"
add dst-host=api.razorpay.com action=allow comment="Allow Razorpay API callbacks"
add dst-host=sdk.cashfree.com action=allow comment="Allow Cashfree checkout"
add dst-host=api.cashfree.com action=allow comment="Allow Cashfree PG"
add dst-host=api.phonepe.com action=allow comment="Allow PhonePe PG"

# Ticket users enter the Sriyan ticket code as User-Name.
# Payment-connectivity users enter the payment connectivity publicId as User-Name
# and token as password. FreeRADIUS decides whether to call /authorize or
# /payment-connectivity/authorize.
#
# Payment-connectivity responses include Filter-Id=sriyan-payment-only and
# allowedHosts. Enforce payment-only traffic with firewall/DNS rules; do not
# allow unrestricted internet from this profile.
