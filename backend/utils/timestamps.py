from datetime import datetime, timedelta, timezone
from typing import Any


IST_OFFSET = timezone(timedelta(hours=5, minutes=30))
UTC_OFFSET = timezone.utc


def normalize_dvr_timestamp(
    raw_timestamp: str,
    dvr_timezone_hours: float = 5.5,
    clock_drift_seconds: float = 0.0,
    drift_threshold_seconds: float = 300.0,
    time_format: str = "%Y-%m-%d %H:%M:%S"
) -> dict[str, Any]:
    """
    Normalizes a raw DVR timestamp, corrects clock drift, and calculates UTC/IST.
    
    Args:
        raw_timestamp: The time string extracted from the DVR logs or metadata.
        dvr_timezone_hours: The timezone offset of the DVR in hours (default 5.5 for IST).
        clock_drift_seconds: The calculated offset of the DVR clock relative to true NTP time.
                             (e.g., if the DVR is 5 minutes FAST, this should be -300).
        drift_threshold_seconds: Threshold above which drift is flagged as forensically significant.
        time_format: The datetime format string expected in the raw timestamp.
        
    Returns:
        A dictionary containing the parsed UTC time, IST time, drift applied, and a drift flag.
    """
    naive_dt = datetime.strptime(raw_timestamp, time_format)
    
    dvr_tz = timezone(timedelta(hours=dvr_timezone_hours))
    aware_dt = naive_dt.replace(tzinfo=dvr_tz)
    
    true_utc_dt = aware_dt.astimezone(UTC_OFFSET) + timedelta(seconds=clock_drift_seconds)
    
    true_ist_dt = true_utc_dt.astimezone(IST_OFFSET)
    
    return {
        "raw_timestamp": raw_timestamp,
        "utc_timestamp": true_utc_dt,
        "ist_timestamp": true_ist_dt,
        "clock_drift_seconds": clock_drift_seconds,
        "drift_flagged": abs(clock_drift_seconds) > drift_threshold_seconds
    }
