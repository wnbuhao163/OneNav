import { useEffect, useState } from 'react'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sun,
  Thermometer,
  Wind,
  X,
} from 'lucide-react'

type WeatherInfo = {
  temp: number
  feelsLike: number
  humidity: number
  wind: number
  high: number
  low: number
  text: string
  code: number
  isDay: boolean
}

type DayForecast = {
  date: string
  label: string
  high: number
  low: number
  text: string
  code: number
}

type Coords = { latitude: number; longitude: number }

function weatherFromCode(code: number, isDay = true) {
  if (code === 0) return { text: isDay ? '晴朗' : '晴夜', Icon: isDay ? Sun : Moon }
  if (code === 1) return { text: '大部晴朗', Icon: isDay ? Sun : Moon }
  if (code === 2) return { text: '局部多云', Icon: CloudSun }
  if (code === 3) return { text: '阴天', Icon: Cloud }
  if (code === 45 || code === 48) return { text: '有雾', Icon: CloudFog }
  if (code === 51 || code === 53 || code === 55) return { text: '毛毛雨', Icon: CloudRain }
  if (code === 56 || code === 57) return { text: '冻毛毛雨', Icon: CloudRain }
  if (code === 61) return { text: '小雨', Icon: CloudRain }
  if (code === 63) return { text: '中雨', Icon: CloudRain }
  if (code === 65) return { text: '大雨', Icon: CloudRain }
  if (code === 66 || code === 67) return { text: '冻雨', Icon: CloudRain }
  if (code === 71) return { text: '小雪', Icon: CloudSnow }
  if (code === 73) return { text: '中雪', Icon: CloudSnow }
  if (code === 75 || code === 77) return { text: '大雪', Icon: CloudSnow }
  if (code === 80) return { text: '小阵雨', Icon: CloudRain }
  if (code === 81) return { text: '中阵雨', Icon: CloudRain }
  if (code === 82) return { text: '强阵雨', Icon: CloudRain }
  if (code === 85) return { text: '小阵雪', Icon: CloudSnow }
  if (code === 86) return { text: '强阵雪', Icon: CloudSnow }
  if (code === 95) return { text: '雷暴', Icon: CloudLightning }
  if (code === 96 || code === 99) return { text: '雷暴伴冰雹', Icon: CloudLightning }
  return { text: '阴', Icon: Cloud }
}

function getBrowserPosition(timeoutMs = 6000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    )
  })
}

async function locateByIp(): Promise<Coords & { city: string }> {
  const res = await fetch('https://get.geojs.io/v1/ip/geo.json')
  if (!res.ok) throw new Error('ip geo failed')
  const data = await res.json()
  const latitude = Number(data.latitude)
  const longitude = Number(data.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('invalid ip coords')
  }
  const city = [data.city, data.region].filter(Boolean).join(' · ') || data.country || '未知位置'
  return { latitude, longitude, city }
}

async function reverseCity(latitude: number, longitude: number): Promise<string> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`
  const res = await fetch(url)
  if (!res.ok) throw new Error('reverse geo failed')
  const data = await res.json()
  const city =
    data.city ||
    data.locality ||
    data.principalSubdivision ||
    data.countryName ||
    ''
  return String(city || '当前位置')
}

async function fetchWeather(latitude: number, longitude: number): Promise<{
  weather: WeatherInfo
  days: DayForecast[]
}> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('weather failed')
  const data = await res.json()
  const current = data.current || {}
  const daily = data.daily || {}
  const code = Number(current.weather_code ?? 0)
  const isDay = Number(current.is_day ?? 1) === 1
  const weather: WeatherInfo = {
    temp: Math.round(Number(current.temperature_2m ?? 0)),
    feelsLike: Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    wind: Math.round(Number(current.wind_speed_10m ?? 0)),
    high: Math.round(Number(daily.temperature_2m_max?.[0] ?? current.temperature_2m ?? 0)),
    low: Math.round(Number(daily.temperature_2m_min?.[0] ?? current.temperature_2m ?? 0)),
    text: weatherFromCode(code, isDay).text,
    code,
    isDay,
  }

  const labels = ['今天', '明天', '后天']
  const days: DayForecast[] = (daily.time || []).slice(0, 3).map((date: string, i: number) => {
    const dayCode = Number(daily.weather_code?.[i] ?? 0)
    return {
      date,
      label: labels[i] || date,
      high: Math.round(Number(daily.temperature_2m_max?.[i] ?? 0)),
      low: Math.round(Number(daily.temperature_2m_min?.[i] ?? 0)),
      text: weatherFromCode(dayCode, true).text,
      code: dayCode,
    }
  })

  return { weather, days }
}

function formatDate(now: Date) {
  const d = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  const w = now.toLocaleDateString('zh-CN', { weekday: 'short' })
  return `${d} · ${w}`
}

function formatHm(now: Date) {
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return { h, m }
}

function formatSec(now: Date) {
  return String(now.getSeconds()).padStart(2, '0')
}

export function PublicHeaderMeta() {
  const [now, setNow] = useState(() => new Date())
  const [city, setCity] = useState('定位中')
  const [weather, setWeather] = useState<WeatherInfo | null>(null)
  const [days, setDays] = useState<DayForecast[]>([])
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        let coords: Coords
        let cityName = ''
        try {
          coords = await getBrowserPosition()
          cityName = await reverseCity(coords.latitude, coords.longitude)
        } catch {
          const ip = await locateByIp()
          coords = { latitude: ip.latitude, longitude: ip.longitude }
          cityName = ip.city
        }
        const result = await fetchWeather(coords.latitude, coords.longitude)
        if (cancelled) return
        setCity(cityName)
        setWeather(result.weather)
        setDays(result.days)
      } catch {
        if (cancelled) return
        setCity('定位失败')
        setWeather(null)
        setDays([])
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!detailOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailOpen])

  const WeatherIcon = weather
    ? weatherFromCode(weather.code, weather.isDay).Icon
    : CloudSun
  const { h, m } = formatHm(now)
  const sec = formatSec(now)

  return (
    <div className="public-header-meta" aria-label="日期时间与天气">
      <div className="public-meta-card public-surface">
        <div className="public-meta-block public-meta-time">
          <strong className="public-meta-primary public-meta-clock" aria-label={`${h}:${m}:${sec}`}>
            <span>{h}</span>
            <span className="public-meta-colon" aria-hidden>
              :
            </span>
            <span>{m}</span>
            <span className="public-meta-sec">{sec}</span>
          </strong>
          <span className="public-meta-secondary">{formatDate(now)}</span>
        </div>

        <span className="public-meta-divider" aria-hidden />

        <button
          type="button"
          className={`public-meta-weather${detailOpen ? ' is-open' : ''}`}
          onClick={() => setDetailOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={detailOpen}
          title="查看天气详情"
        >
          <div className="public-meta-weather-top">
            <span className={`public-meta-weather-icon${weather?.isDay === false ? ' is-night' : ''}`} aria-hidden>
              <WeatherIcon size={18} strokeWidth={1.9} />
            </span>
            <div className="public-meta-weather-main">
              <div className="public-meta-temp-row">
                <strong className="public-meta-temp">
                  {weather ? weather.temp : '--'}
                  <span className="public-meta-unit">°</span>
                </strong>
                <span className="public-meta-condition">{weather ? weather.text : '加载中'}</span>
              </div>
              <span className="public-meta-city" title={city}>
                <MapPin size={11} strokeWidth={2.4} aria-hidden />
                <span>{city}</span>
              </span>
            </div>
          </div>

          <div className="public-meta-weather-details" aria-hidden>
            <span className="public-meta-detail">
              <Thermometer size={11} strokeWidth={2.2} aria-hidden />
              体感 {weather ? `${weather.feelsLike}°` : '--'}
            </span>
            <span className="public-meta-detail">
              <Droplets size={11} strokeWidth={2.2} aria-hidden />
              湿度 {weather ? `${weather.humidity}%` : '--'}
            </span>
            <span className="public-meta-detail">
              <Wind size={11} strokeWidth={2.2} aria-hidden />
              {weather ? `${weather.wind} km/h` : '--'}
            </span>
            <span className="public-meta-detail public-meta-detail-range">
              {weather ? `${weather.low}~${weather.high}°` : '--'}
            </span>
          </div>
        </button>
      </div>

      {detailOpen ? (
        <div className="public-weather-modal" role="dialog" aria-modal="true" aria-label="天气详情">
          <button type="button" className="public-weather-backdrop" aria-label="关闭" onClick={() => setDetailOpen(false)} />
          <div className="public-weather-panel">
            <header className="public-weather-panel-head">
              <div>
                <strong>天气详情</strong>
                <span>{city}</span>
              </div>
              <button type="button" className="public-weather-close" aria-label="关闭" onClick={() => setDetailOpen(false)}>
                <X size={18} strokeWidth={2.2} />
              </button>
            </header>

            <div className="public-weather-now">
              <span className={`public-meta-weather-icon${weather?.isDay === false ? ' is-night' : ''}`} aria-hidden>
                <WeatherIcon size={22} strokeWidth={1.8} />
              </span>
              <div>
                <strong>
                  {weather ? weather.temp : '--'}
                  <em>°</em>
                  <span>{weather ? weather.text : '暂无数据'}</span>
                </strong>
                <p>
                  体感 {weather ? `${weather.feelsLike}°` : '--'} · 湿度 {weather ? `${weather.humidity}%` : '--'} · 风速{' '}
                  {weather ? `${weather.wind} km/h` : '--'}
                </p>
              </div>
            </div>

            <div className="public-weather-days">
              {days.length > 0 ? (
                days.map((day) => {
                  const DayIcon = weatherFromCode(day.code, true).Icon
                  return (
                    <div key={day.date} className="public-weather-day">
                      <span className="public-weather-day-label">{day.label}</span>
                      <span className="public-weather-day-icon" aria-hidden>
                        <DayIcon size={16} strokeWidth={1.9} />
                      </span>
                      <span className="public-weather-day-text">{day.text}</span>
                      <span className="public-weather-day-range">
                        {day.low}~{day.high}°
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="public-weather-empty">暂无预报</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
