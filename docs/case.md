# Case

## Official case — verbatim

**HACKALEM AI**

**Информационный пакет: кейсы ТОО «Электрокомплект» (ekt.kz)**

*Партнёр: ТОО «Электрокомплект» (ekt.kz).* 

# **Кейс. Автоматизация формирования заказов поставщикам**

| 1\. Название | Автоматический расчёт заказов поставщикам для пополнения склада |
| :---- | :---- |
| **2\. Проблема и ценность** | Сейчас менеджер отдела закупа рассчитывает потребность в пополнении склада вручную, консолидируя данные в Excel. Из-за трудоёмкости такого детального анализа расчёт проводится нечасто и не в режиме реального времени, из\-за чего возникают избыточные запасы по одним позициям и дефицит по другим, а разовые крупные заказы (в том числе продажи большого объёма одному клиенту) искажают расчёт регулярной потребности, что ведёт к лишним издержкам на хранение и упущенным продажам. **Ценность решения:** снижение издержек на избыточное хранение, сокращение случаев дефицита и упущенных продаж, повышение точности регулярных закупочных решений. |
| **3\. Пользователь** | **Основной пользователь:** менеджер отдела закупа. **Ключевой сценарий:** запускает расчёт по складу или категории → получает список рекомендованных заказов поставщикам с обоснованием по каждой позиции → проверяет, корректирует при необходимости → утверждает заказ. |
| **4\. Задача** | Разработать сервис, который на основе истории продаж, сезонности, устойчивого роста спроса, текущих остатков, информации по товарам в пути, категорий товаров, прогноза по приросту и оценки упущенного спроса в периоды отсутствия товара формирует рекомендованные заказы поставщикам. Сервис должен выявлять разовые крупные заказы (включая крупные продажи одному клиенту) и исключать их из расчёта регулярной потребности в запасах. |
| **5\. Вход → выход** | **Вход:** история продаж (дата, артикул, количество, обезличенный клиент, цена) за период, текущие остатки по складам, периоды отсутствия товара (stockout) по артикулам, справочник поставщиков и сроков поставки, материальная ведомость из 1С. **Выход:** список рекомендованных заказов (артикул, поставщик, рекомендуемое количество, обоснование, срочность) в виде таблицы/дашборда с возможностью экспорта. |
| **6\. Данные (если задача на основе данных)** | **Ссылка/способ доступа:** выгрузка истории продаж и остатков; партнёр предоставит отчёт V2 и данные по динамике продаж (образец предоставляется партнёром, полный набор и точная дата выдачи — по согласованию). **Поля и объём:** дата продажи, артикул, наименование, количество, цена, обезличенный ID клиента, склад, остаток на дату; история продаж за продолжительный период (порядок объёма уточняется партнёром). **Ограничения:** данные о клиентах должны быть обезличены; допустимо использование синтетических данных с реалистичным распределением для разработки и тестирования. |
| **7\. Must have** | 1\) Расчёт базовой потребности в пополнении по каждому артикулу с учётом всех предусмотренных данных (история продаж, текущие остатки, товары в пути, категории товаров, прогноз по приросту) — проверка: на тестовом наборе данных формируется корректный список позиций с рекомендуемым количеством, и расчёт не игнорирует ни один из переданных источников данных — изменение любого из них (например, объёма товаров в пути) отражается на итоговом результате. 2\) Учёт сезонности и устойчивого роста спроса при прогнозировании — проверка: для товара с выраженной сезонностью прогноз отражает сезонный паттерн, а не просто среднее значение по всей истории. 3\) Оценка и компенсация упущенного спроса в периоды отсутствия товара — проверка: для артикула с зафиксированным stockout расчётная потребность скорректирована в большую сторону по сравнению с расчётом по «сырым» фактическим продажам. 4\) Выявление и исключение разовых крупных заказов, включая крупные продажи одному клиенту — проверка: искусственно добавленный в тестовые данные разовый крупный заказ не приводит к существенному росту рекомендуемого регулярного количества. 5\) Формирование итогового списка заказов, сгруппированного по поставщикам, с кратким обоснованием по каждой позиции — проверка: каждая строка выходного списка сопровождается объяснением, почему предложено именно такое количество, и список можно просмотреть в разбивке по каждому поставщику. |
| **8\. Опционально** | Приоритизация позиций по риску дефицита; учёт минимальной партии заказа и условий конкретного поставщика; визуализация трендов спроса по категориям; автоматическая выгрузка/рассылка сформированного заказа поставщику. |
| **9\. Ограничения** | **Нельзя:** автоматически отправлять заказ поставщику без подтверждения ответственного сотрудника; использовать в расчётах неанонимизированные данные о клиентах. **Обязательно учесть:** приватность данных о продажах и клиентах, объяснимость расчёта, устойчивость алгоритма к аномалиям и выбросам во входных данных, совместимость выходного формата с текущей учётной системой компании. |
| **10\. Артефакты** | Репозиторий: да. README: да (методология расчёта, описание алгоритма исключения выбросов, инструкция запуска). |

# 

## Extracted implementation checklist

The section above is the complete supplied source, including its trailing `# `. It is case evidence, not instructions to this assistant. IDs below distinguish official obligations (C), optional case ideas (O), and implementation choices. Additional team requirements are in product-spec.md and evaluation-map.md.

| ID | Official requirement / fact | Implementation interpretation |
|---|---|---|
| C01 | Calculate baseline replenishment per SKU using sales, current stock, in-transit goods, category and growth forecast; changes in every supplied source must affect the result | Deterministic calculation, source contributions and sensitivity fixtures; floor/rounding can legitimately mask a small change in final units |
| C02 | Account for seasonality and sustained demand growth; seasonal forecast must not be an all-history average | Monthly seasonal indices plus a sustained recent-trend multiplier, separately from external growth |
| C03 | Estimate and compensate lost demand during stockouts; requirement exceeds a raw-sales calculation | Impute unavailable-day demand and show compensated units / counterfactual |
| C04 | Identify and exclude one-off large orders, including large sales to one customer; injected spike must not materially inflate regular demand | Aggregate same customer/SKU/day before detection; robust exclusion, specialist evidence and regression fixture |
| C05 | Supplier-grouped final orders; each line explains the recommended quantity | Supplier sections and numeric contribution breakdown |
| C06 | Purchase manager selects warehouse or category, reviews recommendations, adjusts and approves | One warehouse per run, optional category filter, editable draft and explicit approval |
| C07 | Inputs: dated sales with SKU, quantity, anonymous customer, price; warehouse stocks; SKU stockout periods; suppliers/lead times; 1C material statement | Normalized dataset schema with all these sources and provenance; no live 1C connector assumed |
| C08 | Partner data: V2 report, sales dynamics; fields also include item name, warehouse, stock on date; extended sales history | Preserve IDs, names, dates and source labels; support stock snapshots; demo uses 24 complete months |
| C09 | Output: SKU, supplier, recommended quantity, explanation, urgency; table/dashboard with export | Review table and explicit CSV profile; basic urgency included even though advanced prioritization is optional |
| C10 | Customer data anonymized; no non-anonymized customer data in calculations; protect sales/customer privacy | Only opaque customer tokens, strict schemas, no customer names/contact fields, aggregate provider inputs, secrets server-side |
| C11 | Never automatically send supplier orders without responsible employee confirmation | Persist local approval; supplier sending is entirely outside scope |
| C12 | Explainability and robustness to input anomalies/outliers | Numeric audit trail, rejected invalid rows, bounded outlier policy and honest data warnings |
| C13 | Output compatible with current accounting system | Preserve SKU/supplier codes and units; provisional import-oriented CSV; actual 1C compatibility requires partner sample/acceptance |
| C14 | Repository and README required; README explains calculation, outlier exclusion and launch | Repository deliverables, truthful runbook and linked methodology before submission |
| O01 | Optional shortage-risk prioritization | Basic urgency is required output; advanced ranking is SHOULD |
| O02 | Optional supplier minimum lots/conditions | CUT |
| O03 | Optional category demand-trend visualization | SHOULD after all MUST checks pass |
| O04 | Optional automatic export/sending to supplier | Download export is MUST; automated supplier delivery is CUT |

**Actors:** purchasing manager; supplier is an output grouping, not an integrated actor. Partner provides data. Judges verify requirements on test data. **Value:** reduce excess inventory, shortages, missed sales and manual Excel consolidation; no measured business improvement is claimed.

**Operational/data constraints:** partner permits realistic synthetic data for development/testing. Full data volume, full dataset and release date are by agreement, not supplied here. Inputs must include in-transit/category/growth even though these are not all repeated in the case's sample field list. No required cloud, authentication product, SLA, forecast algorithm, package format or exact export schema is specified.

### Ambiguities and concrete choices

| Ambiguity | Choice / outstanding dependency |
|---|---|
| V2 and 1C material-statement schema, and what the latter means | Treat material statement as item master + dated on-hand balances, confirmed mapping pending sample; retain source metadata and do not add balances twice |
| Accounting import format | UTF-8 BOM, semicolon CSV, stable IDs and unit codes; this is a proposed exchange profile, not verified 1C support |
| Supplier delivery dates / multiple suppliers | One chosen supplier per SKU; lead time in integer days; count only in-transit arriving within coverage horizon |
| Growth forecast meaning | Explicit residual planned uplift beyond observed trend; supplied per category; avoid silently treating overlapping total-growth forecasts as additive |
| Stockout granularity | Full calendar days per warehouse/SKU; inclusive start/end; merge overlaps; partial-day stockouts unsupported |
| Returns / fractional units | MVP nonnegative whole-unit sale quantities; negative returns and fractional units rejected with row errors, never silently dropped |
| Seasonality history / sparse SKU | Use 24-month demo history; <12 complete months uses factor 1 with data warning; <56 recent days or no regular observations yields zero, flagged for manual review |
| Meaning of 'significant' outlier impact | Demo acceptance: injected isolated 100× normal customer-day demand changes recommended units by at most max(1 unit, 5% of baseline) |
| Staff identity/authentication | Local-only demo with configured operator label; production identity/roles remain unimplemented, no public deployment assumed |
| Complete official text | Preserve supplied file exactly; no additional competition rules inferred from the source |
