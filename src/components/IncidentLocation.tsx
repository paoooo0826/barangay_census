import { useEffect, useRef, useState } from "react";
import { incidentMapUrl, type IncidentPin } from "../lib/incidents";

export default function IncidentLocation({
  pin,
  onChange,
  landmark,
  onLandmark,
  disabled,
}: {
  pin: IncidentPin;
  onChange: (value: IncidentPin) => void;
  landmark: string;
  onLandmark: (value: string) => void;
  disabled: boolean;
}) {
  const [reading, setReading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (disabled) {
      generation.current++;
      setReading(false);
    }
  }, [disabled]);
  const map =
    pin.latitude.trim() && pin.longitude.trim()
      ? incidentMapUrl(Number(pin.latitude), Number(pin.longitude))
      : null;
  function editPin(value: IncidentPin) {
    generation.current++;
    setReading(false);
    onChange(value);
  }
  function locate() {
    if (disabled || reading) return;
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Enter a landmark or coordinates manually.",
      );
      return;
    }
    const token = ++generation.current;
    setReading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (token !== generation.current) return;
        onChange({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.max(0, Math.min(100000, position.coords.accuracy))
            : null,
        });
        setReading(false);
      },
      (failure) => {
        if (token !== generation.current) return;
        setReading(false);
        setError(
          failure.code === 1
            ? "Location permission was denied. You can still type the address, landmark, or coordinates."
            : "Your location could not be found. Try again or enter the location manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return (
    <fieldset
      className="space-y-3 rounded-xl border border-slate-200 p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-bold">
        More Location Details (Optional)
      </legend>
      <label className="label">
        Nearby Landmark
        <input
          className="input mt-2"
          maxLength={300}
          value={landmark}
          onChange={(e) => onLandmark(e.target.value)}
          placeholder="Example: beside the barangay hall"
        />
      </label>
      <p className="text-xs text-slate-600">
        Use the incident location. Your current location may be different from
        where it happened.
      </p>
      <button
        type="button"
        className="btn-secondary"
        disabled={reading || disabled}
        onClick={locate}
      >
        {reading ? "Finding Location…" : "Use My Current Location"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Latitude
          <input
            type="number"
            min={-90}
            max={90}
            step="0.000001"
            className="input mt-2"
            value={pin.latitude}
            onChange={(e) =>
              editPin({ ...pin, latitude: e.target.value, accuracy: null })
            }
          />
        </label>
        <label className="label">
          Longitude
          <input
            type="number"
            min={-180}
            max={180}
            step="0.000001"
            className="input mt-2"
            value={pin.longitude}
            onChange={(e) =>
              editPin({ ...pin, longitude: e.target.value, accuracy: null })
            }
          />
        </label>
      </div>
      {pin.accuracy !== null && (
        <p className="text-xs text-slate-600">
          Device accuracy: approximately ±{Math.round(pin.accuracy)} metres.
          Check the pin before submitting.
        </p>
      )}
      {map && (
        <a
          href={map}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-bold text-pine-700 underline"
        >
          Check Pin on OpenStreetMap
        </a>
      )}
      {(pin.latitude || pin.longitude) && (
        <button
          type="button"
          className="ml-3 text-sm underline"
          onClick={() => {
            generation.current++;
            setReading(false);
            onChange({ latitude: "", longitude: "", accuracy: null });
          }}
        >
          Clear Pin
        </button>
      )}
    </fieldset>
  );
}
