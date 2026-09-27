from datetime import date, timedelta
from curl_cffi import requests
from bs4 import BeautifulSoup


# =========================================================
# FX SOURCE TEST
#
# Priority:
#
# Visa
#   Visa calculator
#   -> First Bank fallback
#
# Mastercard
#   Mastercard calculator
#   -> First Bank fallback
#
# JCB / Other
#   First Bank
#
# This version only TESTS the sources.
# It does NOT write JSON yet.
# =========================================================


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

HOME_CURRENCY = "TWD"

TEST_CURRENCIES = [
    "USD",
    "JPY",
    "EUR",
    "GBP",
]


VISA_URL = (
    "https://www.visa.co.in/cmsapi/fx/rates"
)


MASTERCARD_URL = (
    "https://www.mastercard.com/"
    "marketingservices/public/mccom-services/"
    "currency-conversions/conversion-rates"
)


FIRST_BANK_URL = (
    "https://www.firstbank.com.tw/"
    "sites/fcb/ForExRatesInquiry"
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


FIRST_BANK_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 "
        "(Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/140.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,"
        "application/xml;q=0.9,*/*;q=0.8"
    ),
}


# ---------------------------------------------------------
# Session
# ---------------------------------------------------------

def create_session():

    return requests.Session(
        impersonate="chrome"
    )


# ---------------------------------------------------------
# Visa
# ---------------------------------------------------------

def get_visa_rate(
    session,
    rate_date,
    spend_currency,
    home_currency="TWD",
):

    formatted_date = (
        rate_date.strftime("%m/%d/%Y")
    )

    params = {
        "amount": "1",
        "fee": "0",
        "utcConvertedDate": formatted_date,
        "exchangedate": formatted_date,

        # Visa calculator direction:
        # fromCurr = billing/home currency
        # toCurr   = transaction/spend currency
        "fromCurr": home_currency,
        "toCurr": spend_currency,
    }

    response = session.get(
        VISA_URL,
        headers=VISA_HEADERS,
        params=params,
        timeout=30,
    )

    print(
        f"  Visa HTTP: "
        f"{response.status_code}"
    )

    if response.status_code != 200:
        return None

    try:
        data = response.json()

    except Exception:
        return None

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

    try:
        return float(rate)

    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------
# Mastercard
# ---------------------------------------------------------

def get_mastercard_rate(
    session,
    rate_date,
    spend_currency,
    home_currency="TWD",
):

    params = {
        "exchange_date":
            rate_date.strftime("%Y-%m-%d"),

        "transaction_currency":
            spend_currency,

        "cardholder_billing_currency":
            home_currency,

        "bank_fee": "0",

        "transaction_amount": "1",
    }

    response = session.get(
        MASTERCARD_URL,
        headers=MASTERCARD_HEADERS,
        params=params,
        timeout=30,
    )

    print(
        f"  Mastercard HTTP: "
        f"{response.status_code}"
    )

    if response.status_code != 200:
        return None

    try:
        data = response.json()

    except Exception:
        return None

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

    try:
        return float(rate)

    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------
# First Bank
# ---------------------------------------------------------

def normalize_text(text):

    return (
        text
        .replace("\xa0", " ")
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
        .strip()
    )


def parse_number(text):

    cleaned = (
        text
        .replace(",", "")
        .strip()
    )

    try:
        return float(cleaned)

    except (TypeError, ValueError):
        return None


def get_first_bank_rates(session):

    response = session.get(
        FIRST_BANK_URL,
        headers=FIRST_BANK_HEADERS,
        timeout=30,
    )

    print()
    print(
        f"First Bank HTTP: "
        f"{response.status_code}"
    )

    if response.status_code != 200:
        return {}

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    rates = {}


    for row in soup.find_all("tr"):

        cells = [
            normalize_text(
                cell.get_text(
                    " ",
                    strip=True
                )
            )
            for cell in row.find_all(
                ["th", "td"]
            )
        ]

        # Expected First Bank spot-rate row:
        #
        # [0] 美金(USD)
        # [1] 即期
        # [2] 31.xxxxx   <- buy
        # [3] 31.xxxxx   <- sell
        #
        # We need spot SELL because the reference
        # calculation is:
        #
        # foreign currency -> amount of TWD needed
        #
        # e.g.
        # USD 100 × spot sell rate
        # = approximate TWD amount

        if len(cells) < 4:
            continue


        rate_type = (
            cells[1]
            .replace(" ", "")
            .strip()
        )


        # Critical:
        # Ignore cash rates, time-deposit rates,
        # 180-day rates, etc.
        if rate_type != "即期":
            continue


        row_text = (
            " ".join(cells)
            .upper()
        )


        for currency in TEST_CURRENCIES:

            if currency not in row_text:
                continue


            buy_rate = parse_number(
                cells[2]
            )

            sell_rate = parse_number(
                cells[3]
            )


            if sell_rate is None:
                continue


            rates[currency] = {
                "buyRate": buy_rate,
                "sellRate": sell_rate,
                "rate": sell_rate,
                "source": "First Bank",
                "rateType": "spot-sell",
                "cells": cells,
            }


    return rates


# ---------------------------------------------------------
# Source selection test
# ---------------------------------------------------------

def test_network_rate(
    network,
    session,
    rate_date,
    currency,
):

    network_lower = network.lower()


    if network_lower == "visa":

        rate = get_visa_rate(
            session,
            rate_date,
            currency,
            HOME_CURRENCY,
        )

        if rate is not None:

            return {
                "rate": rate,
                "source": "Visa",
            }


    elif network_lower == "mastercard":

        rate = get_mastercard_rate(
            session,
            rate_date,
            currency,
            HOME_CURRENCY,
        )

        if rate is not None:

            return {
                "rate": rate,
                "source": "Mastercard",
            }


    # First Bank fallback is deliberately
    # NOT returned here yet.
    #
    # We first need to verify First Bank's
    # current HTML structure and identify the
    # correct spot-rate column.

    return {
        "rate": None,
        "source": "First Bank fallback needed",
    }


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():

    # For this test only, use yesterday.
    #
    # Formal historical storage will use an
    # explicit requested date instead.
    rate_date = (
        date.today()
        - timedelta(days=1)
    )


    print("=" * 60)
    print("FX SOURCE TEST")
    print("=" * 60)

    print(
        f"Reference date: {rate_date}"
    )

    print(
        f"Home currency: {HOME_CURRENCY}"
    )

    print(
        "Currencies: "
        + ", ".join(TEST_CURRENCIES)
    )

    print()


    session = create_session()


    # -----------------------------------------------------
    # Visa / Mastercard multi-currency test
    # -----------------------------------------------------

    for currency in TEST_CURRENCIES:

        print("=" * 60)

        print(
            f"{currency} -> "
            f"{HOME_CURRENCY}"
        )

        print("=" * 60)


        # Visa

        try:

            visa_result = (
                test_network_rate(
                    "Visa",
                    session,
                    rate_date,
                    currency,
                )
            )

        except Exception as error:

            visa_result = {
                "rate": None,
                "source":
                    "First Bank fallback needed",
            }

            print(
                f"  Visa error: {error}"
            )


        if visa_result["rate"] is not None:

            print(
                f"  Visa result: "
                f"1 {currency} "
                f"≈ "
                f"{visa_result['rate']:.6f} "
                f"{HOME_CURRENCY}"
            )

        else:

            print(
                "  Visa result: FAILED "
                "-> First Bank fallback"
            )


        # Mastercard

        try:

            mastercard_result = (
                test_network_rate(
                    "Mastercard",
                    session,
                    rate_date,
                    currency,
                )
            )

        except Exception as error:

            mastercard_result = {
                "rate": None,
                "source":
                    "First Bank fallback needed",
            }

            print(
                f"  Mastercard error: "
                f"{error}"
            )


        if (
            mastercard_result["rate"]
            is not None
        ):

            print(
                f"  Mastercard result: "
                f"1 {currency} "
                f"≈ "
                f"{mastercard_result['rate']:.6f} "
                f"{HOME_CURRENCY}"
            )

        else:

            print(
                "  Mastercard result: FAILED "
                "-> First Bank fallback"
            )


        print()


    # -----------------------------------------------------
    # First Bank page test
    # -----------------------------------------------------

    print("=" * 60)
    print("FIRST BANK FALLBACK TEST")
    print("=" * 60)


    try:

        first_bank_rates = (
            get_first_bank_rates(
                session
            )
        )

    except Exception as error:

        first_bank_rates = {}

        print(
            f"First Bank error: "
            f"{error}"
        )


    print()


    if not first_bank_rates:

        print(
            "First Bank parser: "
            "NO SPOT RATE ROWS FOUND"
        )

    else:

        for currency in TEST_CURRENCIES:

            print("-" * 60)

            print(
                f"First Bank {currency}"
            )


            info = first_bank_rates.get(
                currency
            )


            if info is None:

                print(
                    "  NOT FOUND"
                )

                continue


            print(
                f"  Spot buy: "
                f"{info['buyRate']}"
            )

            print(
                f"  Spot sell: "
                f"{info['sellRate']}"
            )

            print(
                f"  Reference rate: "
                f"1 {currency} "
                f"≈ {info['rate']:.6f} "
                f"{HOME_CURRENCY}"
            )

            print(
                f"  {currency} 100 "
                f"≈ {HOME_CURRENCY} "
                f"{info['rate'] * 100:,.2f}"
            )

            print(
                f"  Source: "
                f"{info['source']}"
            )

            print(
                f"  Rate type: "
                f"{info['rateType']}"
            )


    print()
    print("=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
