// Next steps seeded from the business case. Status and notes live in the
// browser (localStorage), so this file is only the starting state.

// The licensing runway for the aperitivo plan, unpacked into checkable
// stages. Figures and timings are typical for Edinburgh as of Aug 2026 —
// fees are banded by rateable value and policies change, so everything
// here is flagged in-app as "confirm with the board".
export const LICENCE_STEPS = [
  {
    id: 'lic-overprovision',
    title: 'Check the overprovision policy for the target ward',
    detail: "Edinburgh's Licensing Board designates areas with a presumption AGAINST new licences. Check the current policy statement for the actual street before anything else — it can sink the aperitivo plan on its own.",
  },
  {
    id: 'lic-personal',
    title: 'Get the Personal Licence (SCPLH)',
    detail: 'One-day accredited course (~£130–180), then apply to the council with a Disclosure Scotland check (~£50 licence fee). Someone on staff must hold this before the Premises Licence can operate.',
  },
  {
    id: 'lic-premises-docs',
    title: 'Assemble the Premises Licence application pack',
    detail: 'Layout plan of the premises, planning certificate, building standards certificate, food hygiene certificate, and the operating plan (licensed hours — e.g. aperitivo 17:00–20:00 — on-sales/off-sales).',
  },
  {
    id: 'lic-premises-apply',
    title: 'Apply to the City of Edinburgh Licensing Board',
    detail: 'Fee banded by rateable value (typically £800–1,300 for a small café). Neighbour notification and possible hearing; allow roughly 3–6 months end to end.',
  },
  {
    id: 'lic-occasional',
    title: 'Bridge with Occasional Licences if needed',
    detail: 'While the full licence processes, merchant-hosted wine evenings can run on Occasional Licences (low fee per event, limits on how many per year — confirm current limits with the board).',
  },
  {
    id: 'lic-food-reg',
    title: 'Register the food business (free, 28 days before opening)',
    detail: 'Separate from alcohol licensing: food business registration with the council plus food hygiene requirements — needed for the café side regardless.',
  },
]

export const STEPS = [
  {
    id: 'find-target',
    title: 'Identify a real target going-concern in the corridor',
    detail: 'The biggest unlock: an actual café for sale in Shandon / Polwarth / Merchiston, with real trading accounts. Watch the Listings tab.',
  },
  {
    id: 'verify-sde',
    title: 'Obtain and verify accounts / SDE before any offer',
    detail: 'Small cafés value at 1.5×–2.5× adjusted annual profit. Get an accountant to verify — never take an asking price at face value.',
  },
  {
    id: 'licensing',
    title: 'Confirm the licensing route with Edinburgh licensing board',
    detail: 'Regular aperitivo needs a full Premises Licence + a Personal Licence Holder (qualification + fees). Also clarify who licenses the merchant-hosted wine evenings.',
  },
  {
    id: 'wine-merchant',
    title: 'Open a conversation with a wine merchant',
    detail: 'The commercial split — flat venue fee vs % of tickets — is the biggest undefined variable in the evening economics.',
  },
  {
    id: 'rates-check',
    title: "Verify the actual site's rateable value",
    detail: 'SBBS relief (rates ≈ £0) holds only while RV stays under £12,000. Check the SAA entry for the actual unit, not the comparable.',
  },
  {
    id: 're-run-model',
    title: 'Re-run the model with a real target’s figures',
    detail: 'Swap the scenario assumptions in the Model tab for the target’s actual covers, spend and cost base.',
  },
  {
    id: 'owner-cover',
    title: 'Decide owner cover and backup',
    detail: 'Illness, holiday, burnout — the sole-operator model is the plan’s single point of failure. Name a trusted keyholder early.',
  },
  {
    id: 'apertitivo-staff',
    title: 'Define the aperitivo staff role',
    detail: 'Host vs kitchen support vs hybrid — shapes both the cost line and the owner’s evening workload.',
  },
]
