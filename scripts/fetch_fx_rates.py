from datetime import datetime, timezone, timedelta
from pathlib import Path
import json

from curl_cffi import requests
from bs4 import BeautifulSoup


# =========================================================
# FX Rate Collector
#
# Primary sources:
#   Visa       -> Visa public calculator
#   Mastercard -> Mastercard public calculator
#
# Fallback:
#   First Bank spot sell rate
#
# Rules:
# - Bank fee = 0%
# - Try the requested Taiwan archive date first.
# - If Visa / Mastercard has no usable rate for that date,
#   move backward to the previous available network rate.
# - Only fall back to First Bank when the card-network
#   source remains unavailable.
# - JCB / Other use First Bank.
#
# Output:
#   data/fx/YYYY-MM-DD.json
#   data/fx/latest.json
# =========================================================


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

HOME_CURRENCY = "TWD"

CURRENCIES = [
    "USD",
    "JPY",
    "EUR",
    "GBP",
]


# How far backward the collector may look for an official
# Visa / Mastercard rate when today's rate is not available.
#
# This is collector-side lookup only.
NETWORK_RATE_LOOKBACK_DAYS = 7


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
    "Accept":
        "application/json, text/plain, */*",

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
# Helpers
# ---------------------------------------------------------

def create_session():

    return requests.Session(
        impersonate="chrome"
    )


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
        str(text)
        .replace(",", "")
        .strip()
    )

    try:

        return float(cleaned)

    except (TypeError, ValueError):

        return None


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
        rate_date.strftime(
            "%m/%d/%Y"
        )
    )


    params = {
        "amount":
            "1",

        # Bank fee = 0%
        "fee":
            "0",

        "utcConvertedDate":
            formatted_date,

        "exchangedate":
            formatted_date,

        "fromCurr":
            home_currency,

        "toCurr":
            spend_currency,
    }


    response = session.get(
        VISA_URL,
        headers=VISA_HEADERS,
        params=params,
        timeout=30,
    )


    print(
        f"Visa {spend_currency} "
        f"{rate_date}: "
        f"HTTP {response.status_code}"
    )


    if response.status_code != 200:

        return None


    try:

        data = response.json()

    except Exception:

        print(
            f"Visa {spend_currency} "
            f"{rate_date}: invalid JSON"
        )

        return None


    if data.get("status") != "success":

        print(
            f"Visa {spend_currency} "
            f"{rate_date}: "
            f"status={data.get('status')}"
        )

        return None


    original_values = data.get(
        "originalValues",
        {}
    )


    rate = parse_number(
        original_values.get(
            "fxRateVisa"
        )
    )


    if (
        rate is None
        or rate <= 0
    ):

        print(
            f"Visa {spend_currency} "
            f"{rate_date}: "
            f"no usable rate"
        )

        return None


    return rate


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
            rate_date.strftime(
                "%Y-%m-%d"
            ),

        "transaction_currency":
            spend_currency,

        "cardholder_billing_currency":
            home_currency,

        # Bank fee = 0%
        "bank_fee":
            "0",

        "transaction_amount":
            "1",
    }


    response = session.get(
        MASTERCARD_URL,
        headers=MASTERCARD_HEADERS,
        params=params,
        timeout=30,
    )


    print(
        f"Mastercard {spend_currency} "
        f"{rate_date}: "
        f"HTTP {response.status_code}"
    )


    if response.status_code != 200:

        return None


    try:

        data = response.json()

    except Exception:

        print(
            f"Mastercard {spend_currency} "
            f"{rate_date}: invalid JSON"
        )

        return None


    result = data.get(
        "data",
        {}
    )


    if result.get(
        "errorCode"
    ):

        print(
            f"Mastercard {spend_currency} "
            f"{rate_date}: "
            f"errorCode="
            f"{result.get('errorCode')}"
        )

        return None


    rate = parse_number(
        result.get(
            "conversionRate"
        )
    )


    if (
        rate is None
        or rate <= 0
    ):

        print(
            f"Mastercard {spend_currency} "
            f"{rate_date}: "
            f"no usable rate"
        )

        return None


    return rate


# ---------------------------------------------------------
# Previous available network rate
# ---------------------------------------------------------

def find_previous_network_rate(
    fetch_function,
    session,
    requested_date,
    spend_currency,
    home_currency,
    network_name,
):

    for days_back in range(
        NETWORK_RATE_LOOKBACK_DAYS + 1
    ):

        candidate_date = (
            requested_date
            - timedelta(
                days=days_back
            )
        )


        try:

            rate = fetch_function(
                session,
                candidate_date,
                spend_currency,
                home_currency,
            )

        except Exception as error:

            rate = None

            print(
                f"{network_name} "
                f"{spend_currency} "
                f"{candidate_date} error: "
                f"{error}"
            )


        if (
            rate is not None
            and rate > 0
        ):

            if days_back > 0:

                print(
                    f"{network_name} "
                    f"{spend_currency}: "
                    f"using previous available "
                    f"date {candidate_date}"
                )


            return {
                "rate":
                    rate,

                "rateDate":
                    candidate_date,
            }


    print(
        f"{network_name} "
        f"{spend_currency}: "
        f"no usable network rate found "
        f"within "
        f"{NETWORK_RATE_LOOKBACK_DAYS} "
        f"previous day(s)"
    )


    return None


# ---------------------------------------------------------
# First Bank
# ---------------------------------------------------------

def get_first_bank_rates(
    session
):

    response = session.get(
        FIRST_BANK_URL,
        headers=FIRST_BANK_HEADERS,
        timeout=30,
    )


    print(
        f"First Bank: "
        f"HTTP {response.status_code}"
    )


    if response.status_code != 200:

        return {}


    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )


    rates = {}


    for row in soup.find_all(
        "tr"
    ):

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


        if len(cells) < 4:

            continue


        rate_type = (
            cells[1]
            .replace(
                " ",
                ""
            )
            .strip()
        )


        # Only use spot rates.
        if rate_type != "即期":

            continue


        row_text = (
            " ".join(
                cells
            )
            .upper()
        )


        for currency in CURRENCIES:

            if currency not in row_text:

                continue


            buy_rate = parse_number(
                cells[2]
            )


            sell_rate = parse_number(
                cells[3]
            )


            if (
                sell_rate is None
                or sell_rate <= 0
            ):

                continue


            rates[currency] = {
                "buyRate":
                    buy_rate,

                "sellRate":
                    sell_rate,
            }


    return rates


# ---------------------------------------------------------
# Build First Bank fallback object
# ---------------------------------------------------------

def build_first_bank_fallback(
    first_bank,
    fetched_at,
):

    if first_bank is None:

        return {
            "rate":
                None,

            "source":
                None,

            "rateDate":
                None,

            "fallbackUsed":
                True,
        }


    return {
        "rate":
            first_bank["sellRate"],

        "source":
            "First Bank",

        "rateType":
            "spot-sell",

        # First Bank is the rate captured when
        # this workflow runs, not a historical
        # network-rate request date.
        "rateDate":
            None,

        "fetchedAt":
            fetched_at,

        "fallbackUsed":
            True,
    }


# ---------------------------------------------------------
# Build one currency
# ---------------------------------------------------------

def build_currency_data(
    session,
    rate_date,
    currency,
    first_bank_rates,
    fetched_at,
):

    result = {}


    first_bank = (
        first_bank_rates.get(
            currency
        )
    )


    # -----------------------------------------------------
    # First Bank
    # -----------------------------------------------------

    if first_bank is not None:

        result["firstBank"] = {
            "rate":
                first_bank[
                    "sellRate"
                ],

            "buyRate":
                first_bank[
                    "buyRate"
                ],

            "sellRate":
                first_bank[
                    "sellRate"
                ],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "fetchedAt":
                fetched_at,
        }


    else:

        result["firstBank"] = {
            "rate":
                None,

            "buyRate":
                None,

            "sellRate":
                None,

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "fetchedAt":
                fetched_at,
        }


    # -----------------------------------------------------
    # Visa
    #
    # Visa first.
    # If requested date is unavailable, search backward.
    # First Bank only if Visa remains unavailable.
    # -----------------------------------------------------

    visa_result = (
        find_previous_network_rate(
            get_visa_rate,
            session,
            rate_date,
            currency,
            HOME_CURRENCY,
            "Visa",
        )
    )


    if visa_result is not None:

        result["visa"] = {
            "rate":
                visa_result[
                    "rate"
                ],

            "source":
                "Visa",

            "rateDate":
                visa_result[
                    "rateDate"
                ].isoformat(),

            "fallbackUsed":
                False,
        }


    else:

        result["visa"] = (
            build_first_bank_fallback(
                first_bank,
                fetched_at,
            )
        )


    # -----------------------------------------------------
    # Mastercard
    #
    # Mastercard first.
    # If requested date is unavailable, search backward.
    # First Bank only if Mastercard remains unavailable.
    # -----------------------------------------------------

    mastercard_result = (
        find_previous_network_rate(
            get_mastercard_rate,
            session,
            rate_date,
            currency,
            HOME_CURRENCY,
            "Mastercard",
        )
    )


    if mastercard_result is not None:

        result["mastercard"] = {
            "rate":
                mastercard_result[
                    "rate"
                ],

            "source":
                "Mastercard",

            "rateDate":
                mastercard_result[
                    "rateDate"
                ].isoformat(),

            "fallbackUsed":
                False,
        }


    else:

        result["mastercard"] = (
            build_first_bank_fallback(
                first_bank,
                fetched_at,
            )
        )


    # -----------------------------------------------------
    # JCB
    #
    # No JCB network source is currently being used.
    # Use First Bank.
    # -----------------------------------------------------

    result["jcb"] = (
        build_first_bank_fallback(
            first_bank,
            fetched_at,
        )
    )


    # -----------------------------------------------------
    # Other networks
    # -----------------------------------------------------

    result["other"] = (
        build_first_bank_fallback(
            first_bank,
            fetched_at,
        )
    )


    return result


# ---------------------------------------------------------
# Save JSON
# ---------------------------------------------------------

def save_json(
    data,
    archive_date,
):

    output_dir = Path(
        "data/fx"
    )


    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )


    historical_file = (
        output_dir
        / (
            f"{archive_date.isoformat()}"
            ".json"
        )
    )


    latest_file = (
        output_dir
        / "latest.json"
    )


    json_text = json.dumps(
        data,
        ensure_ascii=False,
        indent=2,
    )


    historical_file.write_text(
        json_text + "\n",
        encoding="utf-8",
    )


    latest_file.write_text(
        json_text + "\n",
        encoding="utf-8",
    )


    print()

    print(
        f"Saved: "
        f"{historical_file}"
    )


    print(
        f"Saved: "
        f"{latest_file}"
    )


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():

    # -----------------------------------------------------
    # Taiwan archive date
    # -----------------------------------------------------

    taiwan_now = (
        datetime.now(
            timezone.utc
        )
        + timedelta(
            hours=8
        )
    )


    archive_date = (
        taiwan_now.date()
    )


    # Visa / Mastercard initially request the Taiwan
    # archive date. If unavailable, each network searches
    # backward independently.
    rate_date = (
        archive_date
    )


    fetched_at = (
        datetime.now(
            timezone.utc
        )
        .replace(
            microsecond=0
        )
        .isoformat()
        .replace(
            "+00:00",
            "Z"
        )
    )


    print(
        "=" * 60
    )

    print(
        "FX RATE COLLECTION"
    )

    print(
        "=" * 60
    )


    print(
        f"Archive date: "
        f"{archive_date}"
    )


    print(
        f"Visa / Mastercard "
        f"request date: "
        f"{rate_date}"
    )


    print(
        f"Fetched at: "
        f"{fetched_at}"
    )


    print(
        f"Home currency: "
        f"{HOME_CURRENCY}"
    )


    print(
        "Currencies: "
        + ", ".join(
            CURRENCIES
        )
    )


    print()


    session = (
        create_session()
    )


    # -----------------------------------------------------
    # First Bank
    # -----------------------------------------------------

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


    # -----------------------------------------------------
    # Collect currencies
    # -----------------------------------------------------

    rates = {}


    for currency in CURRENCIES:

        print(
            "-" * 60
        )


        print(
            f"Collecting "
            f"{currency} -> "
            f"{HOME_CURRENCY}"
        )


        rates[currency] = (
            build_currency_data(
                session,
                rate_date,
                currency,
                first_bank_rates,
                fetched_at,
            )
        )


    # -----------------------------------------------------
    # Output
    # -----------------------------------------------------

    data = {
        "schemaVersion":
            1,

        "archiveDate":
            archive_date.isoformat(),

        "homeCurrency":
            HOME_CURRENCY,

        "fetchedAt":
            fetched_at,

        "rates":
            rates,
    }


    save_json(
        data,
        archive_date,
    )


    # -----------------------------------------------------
    # Summary
    # -----------------------------------------------------

    print()

    print(
        "=" * 60
    )

    print(
        "SUMMARY"
    )

    print(
        "=" * 60
    )


    for currency in CURRENCIES:

        currency_data = (
            rates[
                currency
            ]
        )


        print()


        print(
            f"{currency} -> "
            f"{HOME_CURRENCY}"
        )


        for network in [
            "visa",
            "mastercard",
            "jcb",
        ]:

            info = (
                currency_data[
                    network
                ]
            )


            rate = (
                info.get(
                    "rate"
                )
            )


            source = (
                info.get(
                    "source"
                )
            )


            rate_date_used = (
                info.get(
                    "rateDate"
                )
            )


            fallback_used = (
                info.get(
                    "fallbackUsed"
                )
            )


            if rate is None:

                print(
                    f"  {network}: "
                    f"UNAVAILABLE"
                )

                continue


            fallback_text = (
                " [fallback]"
                if fallback_used
                else ""
            )


            date_text = (
                f" [rate date: "
                f"{rate_date_used}]"
                if rate_date_used
                else ""
            )


            print(
                f"  {network}: "
                f"{rate:.6f} "
                f"({source})"
                f"{date_text}"
                f"{fallback_text}"
            )


    print()

    print(
        "=" * 60
    )

    print(
        "COLLECTION COMPLETE"
    )

    print(
        "=" * 60
    )


if __name__ == "__main__":
    main()
