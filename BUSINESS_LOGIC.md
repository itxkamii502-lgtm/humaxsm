# Alpha SMS — Business Logic & Rules

This document details the exact business rules, hierarchical access control, number allocation lifecycle, financial calculations, and data scoping policies enforced in Alpha SMS.

---

## 1. Role Hierarchy & Authority

The system strictly enforces a 4-tier chain of authority:

```
[ Tier 1: OWNER / ADMIN ]   -> Kamran_Bhatti (Superadmin, Global Master)
          |
[ Tier 2: MANAGER ]         -> Direct downline of Owner (Manages Agent Network)
          |
[ Tier 3: AGENT ]           -> Direct downline of Manager (Manages Clients)
          |
[ Tier 4: CLIENT ]          -> Direct downline of Agent (End-user consuming numbers)
```

### 1.1 Authority Invariants
1. **Owner (`Kamran_Bhatti`)**:
   - Holds global master rights.
   - Can create/delete termination ranges, upload number pools, configure SMPP accounts, and manage Managers.
   - Can recall numbers from any tier back to the Owner pool at any time.
   - Has unmasked visibility across all CLIs, carrier costs, and system profits.

2. **Manager**:
   - Manages an isolated network of Agents.
   - Cannot see other Managers' agents, numbers, or traffic.
   - Can only assign numbers from their own allocated pool to their own Agents.
   - Can return unassigned numbers back to the Owner pool.

3. **Agent**:
   - Manages an isolated network of Clients.
   - Cannot see other Agents' clients, numbers, or traffic.
   - Can allocate numbers from their own pool to their Clients.
   - Can move assigned numbers between their own Clients (`/api/numbers/:id/move`).
   - Can return unassigned numbers back to their Manager pool.

4. **Client**:
   - End-user receiving SMS traffic and verifying OTPs.
   - Cannot create downline users or assign numbers.
   - Can only view their own assigned numbers and traffic.
   - Can return numbers back to their Agent pool.

---

## 2. Number Allocation & Return Lifecycle

### 2.1 Forward Allocation Rules
- **Flow**: Owner -> Manager -> Agent -> Client.
- An owner cannot assign directly to a Client without traversing the hierarchy (Owner -> Manager -> Agent -> Client).
- A holder can only allocate numbers that are currently free in their own pool:
  - Owner pool: `manager_id === null && agent_id === null && client_id === null`
  - Manager pool: `manager_id === myId && agent_id === null && client_id === null`
  - Agent pool: `agent_id === myId && client_id === null`

### 2.2 Backward Return Rules
- **Client**: Returns number to Agent (`client_id = null`, `status = 'assigned'`).
- **Agent**: Returns number to Manager (`agent_id = null`, `client_id = null`, `status = n.manager_id ? 'assigned' : 'active'`).
- **Manager**: Returns number to Owner (`manager_id = null`, `agent_id = null`, `client_id = null`, `status = 'active'`).
- **Owner Recall**: An Owner can recall any number held downline via `/api/numbers/recall-manager`.

### 2.3 Test Panel Protection Invariant
- Numbers designated as Test Numbers (`fixed_for_test: true` or `is_test_panel: true` or registered in `test_numbers.json`):
  - **CAN NEVER** be assigned to any Manager, Agent, or Client.
  - The API rejects any allocation attempt on a test number with HTTP 400.
  - To allocate a test number, it must first be explicitly removed from the SMS Test Panel.

---

## 3. Financial & Margin Rules

### 3.1 Payout Waterfall
For every incoming SMS on an allocated number:
```
Carrier Cost (What carrier pays us / what route costs)
      >=
Manager Payout (What Owner pays Manager)
      >=
Agent Payout (What Manager pays Agent)
      >=
Client Payout (What Agent pays Client)
```

### 3.2 Margin Validation
- In every allocation, downline rates are strictly validated:
  - `client_rate < agent_rate` (The agent must retain a profit margin).
  - An attempt to set a client rate equal to or greater than the agent rate is rejected with HTTP 400.
- Profit calculation for each tier:
  - **Owner Profit**: `Carrier Rate - Downline Payout`
  - **Manager Profit**: `Manager Payout - Agent Payout`
  - **Agent Profit**: `Agent Payout - Client Payout`
  - Profit values are always clamped to `>= 0`.

### 3.3 Supported Payterms
The platform standardizes on canonical payterm keys:
- `Weekly` (Default)
- `1/1` (Daily)
- `7/1` (Weekly, 1 day hold)
- `7/7` (Weekly, 7 day hold)
- `15/15` (Bi-weekly, 15 day hold)
- `15/30` (Bi-weekly, 30 day hold)
- `30/30` (Monthly, 30 day hold)
- `Monthly60` (Monthly, 60 day hold)

---

## 4. Privacy & Data Scoping Rules

### 4.1 CLI Privacy Policy
- **Owner**: Sees full unmasked CLI (e.g. `WhatsApp`, `Google`, `14155552671`).
- **Manager, Agent, Client**:
  - The CLI is masked for downstream privacy: only the first character is retained followed by masking (e.g. `1Engage` -> `1XXXXX`, `Google` -> `GXXXXX`).
  - Helper `zyMaskCli()` enforces this client-side and in exports.

### 4.2 Query Scoping (`getScopedSmsList`)
All requests to `/api/sms/logs`, `/api/sms/stats`, and `/api/sms/export` pass through `getScopedSmsList(req)`:
- If `role === 'Owner'`: Evaluates optional filters `manager_id`, `agent_id`, `client_id`.
- If `role === 'Manager'`: Hard-filtered by `manager_id === sessionUser.id`.
- If `role === 'Agent'`: Hard-filtered by `agent_id === sessionUser.id`.
- If `role === 'Client'`: Hard-filtered by `client_id === sessionUser.id`.
