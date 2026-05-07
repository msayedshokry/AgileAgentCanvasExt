#  - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown.

## Requirements Inventory

### Functional Requirements


## Epics

### Epic 1: Replicate QAWeb orgs to SalesForce + link orgs to displays.

**Goal:** In this epic, we need to:Replicate QAWeb orgs into SalesForce(un)Link SF displays to their SF organization (link, move, unlink)Data model  (see Salesforce System API)Data tablesThese are tables which need to exist in the data platform (SWIT) and which are synced to QAWeb Enterprise.install_baseThe install base table will contain for each display asset:SalesForce IDConnectCare eligible flag on the display.contractsThere needs to be a list with orgs and their contractsasset_contract_linesThere needs to be a list of contract lines per asset.This table contains info:Asset IDStart dateEnd dateContract line type (id)Display nameactiveImplementationWe work with queues to avoid a runtime dependency on the availability of the SalesForce System API.Create tenants in SalesForceflowchart TD
    User[User]
    webapi[QAWeb WebAPI]
    DB@{ shape: cyl, label: "QAWeb Postgres DB" }
    Queue>Event queue]
    Worker[Worker Lambda]
    SalesForce[SalesForce System API]

    User --> |Create organization| webapi
    webapi --> DB
    webapi --> Queue
    Queue --> Worker
    Worker --> |POST /api/v1/sapi-salesforce/tenants|SalesForceThe reply needs to contain the ID of the tenant. This will be put in the organizations table.|id|name|**salesforce-id**|Extend install_base with SF asset IDThe install_base table in the QAWeb DB (which is a mirror of the same table in the Data platform (synapse)) needs to be extended with an assetID field (SalesForce ID)|modelname|serial|shipto-date|warranty-end|**salesforce-id**|Link display to orgPATCH of /api/v1/sapi-salesforce/assets/{assetId} See  (see Salesforce System API){
    "tenant": "<tenant-id>"
}This is called for every display which is moved to an org. We should avoid calling this at every asset registration (calls for displays that remain in an org are unnecessary).Fit criteriaIn SalesForce, a tenant object is created for each of the QAWeb organizations.The SalesForce asset, related to a display is linked to the Tenant via the tenant field. This maps the display to organization relation in QAWeb Enterprise.The link between SalesForce asset and tenant is update when an asset moves between organizations.The link between SalesForce asset and tenant is broken when an asset is deactivated in QAWeb Portal.The system gracefully absorbs outages of the SalesForce System APIFailing tenant creation should be retriedLink displays to an org without salesforce-id should be retried

#### Stories

##### Story 1.1: Mark ConnectCare_eligible flag for selected models

As a user,
I want Mark ConnectCare_eligible flag for selected models,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.2: Link SF Display asset to a SF Tenant

As a user,
I want Link SF Display asset to a SF Tenant,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.3: Link hospital organization to Tenants in SalesForce

As a user,
I want Link hospital organization to Tenants in SalesForce,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.4: BackOffice shows ConnectCare contract + override

As a user,
I want BackOffice shows ConnectCare contract + override,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.5: Remove licenses table and all related code (such as the connectcare-get-organizations lambda)

As a user,
I want Remove licenses table and all related code (such as the connectcare-get-organizations lambda),
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.6: Extend cached data from Synapse DB

As a user,
I want Extend cached data from Synapse DB,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.7: Add test cases in Windchill

As a user,
I want Add test cases in Windchill,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.8: Add QuickSight dashboard to the backoffice for QAWeb-SF sync issues 

As a user,
I want Add QuickSight dashboard to the backoffice for QAWeb-SF sync issues,
So that achieve the described functionality.

**Acceptance Criteria:**

##### Story 1.9: Refactor master_displays table

As a user,
I want Refactor master_displays table,
So that achieve the described functionality.

**Acceptance Criteria:**

---

