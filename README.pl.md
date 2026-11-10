# ThingsLocal Dashboard

Panel Home Assistant dla [ThingsLocal Bridge](https://github.com/jmguzik/thingslocal-bridge),
z polskim i angielskim interfejsem oraz układem na telefon i komputer.
Bridge jest kontynuacją **LocalThings autorstwa purplesym (Lars)** —
[źródła i podziękowania](UPSTREAM.md).

## Instalacja

1. W HACS dodaj repozytorium `https://github.com/jmguzik/thingslocal-bridge-dashboard`
   jako **Integrację** i pobierz ThingsLocal Dashboard. Alternatywnie skopiuj
   `custom_components/thingslocal_dashboard` do HA.
2. Uruchom Home Assistant ponownie.
3. W **Ustawienia → Urządzenia i usługi → Dodaj integrację** wybierz
   **ThingsLocal Dashboard**.
4. Otwórz **ThingsLocal** w menu bocznym, pod `/thingslocal-dashboard/overview`.

Pierwsze wydanie jest eksperymentalne. W oknie pobierania/wyboru wersji HACS
włącz wydania pre-release/beta i wybierz **v0.1.0**.

Wymagane: HA 2026.10+ oraz istniejące encje ThingsLocal Bridge przez MQTT.
Panel automatycznie grupuje dostępne urządzenia i respektuje uprawnienia konta HA.
Nie wymaga danych logowania do urządzeń.

## Obsługa

- **PL / EN** zmienia język. Domyślnie używany jest język HA.
- Ustawienia widoku pozwalają ukrywać urządzenia, włączyć diagnostykę i kompaktowe
  odczyty. Są zapisywane osobno dla użytkownika HA w bieżącej przeglądarce.
- Dostępne są wyszukiwanie i filtry pracy, zgłoszonych problemów oraz niedostępności.
- Płyta pokazuje pola według ich identyfikatorów. Panel nie zgaduje ich położenia.
- Zmywarka udostępnia istniejącą listę programów, jeśli sterowanie zostało jawnie
  włączone w Bridge. **Wybór programu nie uruchamia mycia.**
- Nieznane urządzenia i odczyty pozostają widoczne na kartach ogólnych.
- Brak licznika myć oznacza brak danych o czyszczeniu, a nie brak potrzeby czyszczenia.

Kartę można też dodać do innego dashboardu:

```yaml
type: custom:thingslocal-bridge-dashboard
language: pl
read_only: true
```

Panel pokazuje komunikaty z urządzenia. Wysyłaniem powiadomień na telefon zajmuje
się osobna automatyzacja ThingsLocal Bridge. Widok nie uruchamia jej przy otwarciu.
Szczegóły, ograniczenia i instrukcje aktualizacji są w [angielskim README](README.md).
