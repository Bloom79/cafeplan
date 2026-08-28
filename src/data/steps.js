// Next steps seeded from the business case. Status and notes live in the
// browser (localStorage), so this file is only the starting state.

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
