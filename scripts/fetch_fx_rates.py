from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import json

from curl_cffi import requests
from bs4 import BeautifulSoup


# =========================================================
# FX Rate Collector
#
# Primary sources:
#   Visa       -> Visa calculator
#   Mastercard -> Mastercard calculator
#
# Fallback:
#   First Bank spot sell rate
#
# Output:
#   data/fx/YYYY-MM-DD.json
#   data/fx/latest.json
#
# IMPORTANT:
# - Visa / Mastercard use RATE_DATE.
# - First Bank currently represents the rate available
#   when this script runs.
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
        rate_date.strftime("%m/%d/%Y")
    )

    params = {
        "amount": "1",
        "fee": "0",
        "utcConvertedDate": formatted_date,
        "exchangedate": formatted_date,
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
        f"Visa {spend_currency}: "
        f"HTTP {response.status_code}"
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

    rate = parse_number(rate)

    if rate is None or rate <= 0:
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
        f"Mastercard {spend_currency}: "
        f"HTTP {response.status_code}"
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

    rate = parse_number(
        result.get("conversionRate")
    )

    if rate is None or rate <= 0:
        return None

    return rate


# ---------------------------------------------------------
# First Bank
# ---------------------------------------------------------

def get_first_bank_rates(session):

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


        if len(cells) < 4:
            continue


        rate_type = (
            cells[1]
            .replace(" ", "")
            .strip()
        )


        # Only use spot rates.
        if rate_type != "即期":
            continue


        row_text = (
            " ".join(cells)
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
                "buyRate": buy_rate,
                "sellRate": sell_rate,
            }


    return rates


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


    # -----------------------------------------------------
    # First Bank fallback
    # -----------------------------------------------------

    first_bank = (
        first_bank_rates.get(
            currency
        )
    )


    if first_bank is not None:

        result["firstBank"] = {
            "rate":
                first_bank["sellRate"],

            "buyRate":
                first_bank["buyRate"],

            "sellRate":
                first_bank["sellRate"],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            # This is deliberately NOT rate_date.
            # It represents the rate fetched when
            # this workflow ran.
            "fetchedAt":
                fetched_at,
        }


    # -----------------------------------------------------
    # Visa
    # -----------------------------------------------------

    try:

        visa_rate = get_visa_rate(
            session,
            rate_date,
            currency,
            HOME_CURRENCY,
        )

    except Exception as error:

        visa_rate = None

        print(
            f"Visa {currency} error: "
            f"{error}"
        )


    if visa_rate is not None:

        result["visa"] = {
            "rate": visa_rate,
            "source": "Visa",
            "rateDate":
                rate_date.isoformat(),
            "fallbackUsed": False,
        }

    elif first_bank is not None:

        result["visa"] = {
            "rate":
                first_bank["sellRate"],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "rateDate": None,

            "fetchedAt":
                fetched_at,

            "fallbackUsed": True,
        }

    else:

        result["visa"] = {
            "rate": None,
            "source": None,
            "rateDate": None,
            "fallbackUsed": True,
        }


    # -----------------------------------------------------
    # Mastercard
    # -----------------------------------------------------

    try:

        mastercard_rate = (
            get_mastercard_rate(
                session,
                rate_date,
                currency,
                HOME_CURRENCY,
            )
        )

    except Exception as error:

        mastercard_rate = None

        print(
            f"Mastercard {currency} error: "
            f"{error}"
        )


    if mastercard_rate is not None:

        result["mastercard"] = {
            "rate":
                mastercard_rate,

            "source":
                "Mastercard",

            "rateDate":
                rate_date.isoformat(),

            "fallbackUsed": False,
        }

    elif first_bank is not None:

        result["mastercard"] = {
            "rate":
                first_bank["sellRate"],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "rateDate": None,

            "fetchedAt":
                fetched_at,

            "fallbackUsed": True,
        }

    else:

        result["mastercard"] = {
            "rate": None,
            "source": None,
            "rateDate": None,
            "fallbackUsed": True,
        }


    # -----------------------------------------------------
    # JCB
    #
    # No reliable JCB source is being used yet.
    # Therefore First Bank is the reference source.
    # -----------------------------------------------------

    if first_bank is not None:

        result["jcb"] = {
            "rate":
                first_bank["sellRate"],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "rateDate": None,

            "fetchedAt":
                fetched_at,

            "fallbackUsed": True,
        }

    else:

        result["jcb"] = {
            "rate": None,
            "source": None,
            "rateDate": None,
            "fallbackUsed": True,
        }


    # -----------------------------------------------------
    # Other card networks
    # -----------------------------------------------------

    if first_bank is not None:

        result["other"] = {
            "rate":
                first_bank["sellRate"],

            "source":
                "First Bank",

            "rateType":
                "spot-sell",

            "rateDate": None,

            "fetchedAt":
                fetched_at,

            "fallbackUsed": True,
        }

    else:

        result["other"] = {
            "rate": None,
            "source": None,
            "rateDate": None,
            "fallbackUsed": True,
        }


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
        / f"{archive_date.isoformat()}.json"
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
    # Archive date
    #
    # From now on, create one FX snapshot per Taiwan
    # calendar day.
    #
    # Receipt lookup will later start from purchaseDate.
    # If that date has no usable FX data, fx.js will move
    # backward until it finds the most recent available
    # snapshot.
    # -----------------------------------------------------

    taiwan_now = (
        datetime.now(timezone.utc)
        + timedelta(hours=8)
    )

    archive_date = (
        taiwan_now.date()
    )

    # -----------------------------------------------------
    # Visa / Mastercard reference date
    #
    # Use today's Taiwan calendar date.
    #
    # From now on, one FX snapshot is archived for each
    # Taiwan calendar day.
    # -----------------------------------------------------

    rate_date = archive_date

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


    print("=" * 60)
    print("FX RATE COLLECTION")
    print("=" * 60)

    print(
        f"Archive date: "
        f"{archive_date}"
    )

    print(
        f"Visa / Mastercard request date: "
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


    session = create_session()


    # -----------------------------------------------------
    # First Bank is fetched once.
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


    rates = {}


    for currency in CURRENCIES:

        print("-" * 60)

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


    data = {
        "schemaVersion": 1,

        # Date of this archived snapshot.
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


    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)


    for currency in CURRENCIES:

        currency_data = (
            rates[currency]
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

            rate = info.get(
                "rate"
            )

            source = info.get(
                "source"
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


            print(
                f"  {network}: "
                f"{rate:.6f} "
                f"({source})"
                f"{fallback_text}"
            )


    print()
    print("=" * 60)
    print("COLLECTION COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
