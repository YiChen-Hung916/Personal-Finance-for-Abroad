from datetime import date, timedelta
from curl_cffi import requests


# =========================================================
# FX Test
# Spend currency: USD
# Billing currency: TWD
#
# This is only a connectivity test.
# It does NOT save anything to Firebase or JSON yet.
# =========================================================


VISA_URL = (
    "https://www.visa.co.in/cmsapi/fx/rates"
)

MASTERCARD_URL = (
    "https://www.mastercard.com/"
    "marketingservices/public/mccom-services/"
    "currency-conversions/conversion-rates"
)


VISA_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": (
        "https://www.visa.co.in/support/consumer/"
        "travel-support/exchange-rate-calculator.html"
    ),
}


MASTERCARD_HEADERS = {
    "Accept": "*/*",
    "Referer": (
        "https://www.mastercard.com/in/en/personal/"
        "get-support/currency-exchange-rate-converter.html"
    ),
}


def create_session():
    return requests.Session(
        impersonate="chrome"
    )


def get_visa_rate(
    session,
    rate_date,
    home_currency="TWD",
    spend_currency="USD",
    amount=100
):
    formatted_date = rate_date.strftime("%m/%d/%Y")

    params = {
        "amount": str(amount),
        "fee": "0",
        "utcConvertedDate": formatted_date,
        "exchangedate": formatted_date,

        # Visa calculator uses these in this direction
        # to obtain HOME currency per SPEND currency.
        "fromCurr": home_currency,
        "toCurr": spend_currency,
    }

    response = session.get(
        VISA_URL,
        headers=VISA_HEADERS,
        params=params,
        timeout=30
    )

    print(
        f"Visa HTTP status: "
        f"{response.status_code}"
    )

    if response.status_code != 200:
        return None

    data = response.json()

    if data.get("status") != "success":
        return None

    original_values = data.get(
        "originalValues",
        {}
    )

    rate = original_values.get(
        "fxRateVisa"
    )

    if rate is None:
        return None

    return float(rate)


def get_mastercard_rate(
    session,
    rate_date,
    home_currency="TWD",
    spend_currency="USD",
    amount=100
):
    params = {
        "exchange_date":
            rate_date.strftime("%Y-%m-%d"),

        "transaction_currency":
            spend_currency,

        "cardholder_billing_currency":
            home_currency,

        "bank_fee": "0",

        "transaction_amount":
            str(amount),
    }

    response = session.get(
        MASTERCARD_URL,
        headers=MASTERCARD_HEADERS,
        params=params,
        timeout=30
    )

    print(
        f"Mastercard HTTP status: "
        f"{response.status_code}"
    )

    if response.status_code != 200:
        return None

    data = response.json()

    result = data.get(
        "data",
        {}
    )

    if result.get("errorCode"):
        return None

    rate = result.get(
        "conversionRate"
    )

    if rate is None:
        return None

    return float(rate)


def main():

    home_currency = "TWD"
    spend_currency = "USD"

    # Use yesterday first.
    # This avoids today's rate possibly not being
    # available yet because of timezone/update timing.
    rate_date = (
        date.today()
        - timedelta(days=1)
    )

    print("=" * 50)
    print("FX TEST")
    print("=" * 50)

    print(
        f"Date: {rate_date}"
    )

    print(
        f"Spend: {spend_currency}"
    )

    print(
        f"Billing: {home_currency}"
    )

    print()

    session = create_session()

    # -------------------------
    # Visa
    # -------------------------

    try:

        visa_rate = get_visa_rate(
            session,
            rate_date,
            home_currency,
            spend_currency
        )

    except Exception as error:

        visa_rate = None

        print(
            f"Visa error: {error}"
        )

    # -------------------------
    # Mastercard
    # -------------------------

    try:

        mastercard_rate = (
            get_mastercard_rate(
                session,
                rate_date,
                home_currency,
                spend_currency
            )
        )

    except Exception as error:

        mastercard_rate = None

        print(
            f"Mastercard error: {error}"
        )

    print()
    print("=" * 50)
    print("RESULT")
    print("=" * 50)

    if visa_rate is not None:

        print(
            f"Visa: "
            f"1 {spend_currency} "
            f"≈ {visa_rate:.4f} "
            f"{home_currency}"
        )

        print(
            f"{spend_currency} 100 "
            f"≈ {home_currency} "
            f"{visa_rate * 100:,.2f}"
        )

    else:

        print(
            "Visa: FAILED"
        )

    print()

    if mastercard_rate is not None:

        print(
            f"Mastercard: "
            f"1 {spend_currency} "
            f"≈ {mastercard_rate:.4f} "
            f"{home_currency}"
        )

        print(
            f"{spend_currency} 100 "
            f"≈ {home_currency} "
            f"{mastercard_rate * 100:,.2f}"
        )

    else:

        print(
            "Mastercard: FAILED"
        )


if __name__ == "__main__":
    main()
