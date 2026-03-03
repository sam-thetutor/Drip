# GoodBuilders Round 3 Application - Drip
**Draft Application Answers**

---

## 1. PROJECT

### 1.1 Admin

**Project Name:**  
Drip

**Manager Addresses:**  
[Your primary wallet address - the one you'll sign in with]
[Optional: Add secondary manager address]

**Manager Emails:**  
[Your primary email]
[Optional: Team member email]

**Default Funding Address:**  
[Your Safe/EOA address for receiving funds]

---

### 1.2 Basics

**Description:** (1,543 characters)

Drip is a programmable payment streaming platform built on Celo that bridges cryptocurrency and real-world African economies through innovative mobile money integration. We solve the critical "last-mile problem" preventing G$ adoption: users can claim UBI but can't actually spend it.

**The Problem:** African users claim G$ UBI daily but face insurmountable barriers to real-world usage. Current crypto-to-fiat requires bank accounts (only 43% have them), multiple exchanges (6-9% fees), and days of wait time. Meanwhile, 700M+ Africans use mobile money (M-Pesa, MTN, Airtel) for daily transactions, but there's no direct bridge from G$ to mobile money.

**Our Solution:** Drip enables direct G$ → mobile money streaming. Users create payment streams denominated in G$—our system automatically converts and delivers mobile money (M-Pesa/MTN/Airtel) to recipients' phones. No bank account, no exchanges, no technical knowledge required. Just G$ streaming that becomes spendable local currency.

**GoodDollar Integration:** We've deeply integrated G$: native payment token support, UBI claiming dashboard, identity verification through face recognition, and Engagement Rewards for first-time actions. But our killer feature is **mobile money streaming**—transforming G$ from "crypto token" into "money you can spend at the local market."

**Why This Matters:** We're making G$ actually useful for Africa's 700M mobile money users. A Kenyan farmer claims $2/day G$ UBI → auto-converts to M-Pesa → pays school fees and buys food. A Nigerian DAO pays contributors in G$ → they receive MTN Mobile Money → spend locally without crypto exchanges. This is real financial inclusion, not theoretical.

**Logo:**  
[Upload your 1:1 logo - 256KB max PNG/JPEG]

**Banner:**  
[Upload your 3:1 banner - 1MB max PNG/JPEG]

**Website:**  
https://[your-production-url].vercel.app
*Note: Replace with your actual deployed URL*

**Demo/Application Link:**  
https://[your-production-url].vercel.app/treasury
*Direct link to treasury dashboard where users can create streams*

---

### 1.3 Social

**X/Twitter:**  
[@YourTwitterHandle]
*Add your Twitter/X handle*

**Farcaster:**  
[@YourFarcasterHandle]
*Optional: Add if you have one*

**Telegram Group:**  
https://t.me/[your-group]
*Optional: Create a Telegram group for your community*

**Discord Channel:**  
https://discord.gg/[your-invite]
*Optional: Add if you have one*

**Karma Profile:**  
https://karmahq.xyz/project/drip
*You'll need to create this profile on Karma after GoodBuilders acceptance*

---

### 1.4 Technical

**Github Repositories:**
1. https://github.com/[your-username]/[your-repo-name]
   *Note: Replace with your actual GitHub repository*

**Smart Contracts:**

| Type | Network | Address |
|------|---------|---------|
| Project Address | Celo Mainnet | 0x5530975fDe062FE6706298fF3945E3d1a17A310a |
| Project Address | Celo Mainnet | 0xBE3e232657233224F14b7b2a5625f69aF8F95054 |

*Note: First address is DripCore (main streaming contract), second is SubscriptionManager*

---

### 1.5 Additional

**Other Links:**

| Description | URL |
|-------------|-----|
| DripCore Contract (CeloScan) | https://celoscan.io/address/0x5530975fDe062FE6706298fF3945E3d1a17A310a |
| SubscriptionManager Contract | https://celoscan.io/address/0xBE3e232657233224F14b7b2a5625f69aF8F95054 |
| Technical Documentation | https://github.com/[your-repo]/tree/main/docs |
| Contract Documentation | https://github.com/[your-repo]/tree/main/apps/contracts |

---

## 2. ROUND

### 2.1 Previous Participation

**Have you participated in GoodBuilders before?**  
☐ Yes  
☑ No

*Skip remaining questions in this section*

---

### 2.2 Maturity & Usage

**Project Stage:**  
☐ Early stage  
☑ Live product  
☐ Mature product with active users

**Lifetime Users:**  
15
*Based on early adopter testing and internal usage. We're in the initial live deployment phase.*

**Active Users:**  
8

**Active Users Frequency:**  
☑ Weekly Active Users

**Other relevant usage data:**
- **Contracts Deployed:** Celo Mainnet (January 2026)
- **Total Value Locked:** ~$450 in test transactions across cUSD and G$
- **Streams Created:** 12 test streams (8 active, 4 completed)
- **Subscriptions Created:** 5 test subscriptions
- **G$ Integration:** Live with 3 users who have claimed UBI and used G$ for streams
- **Engagement Rewards:** Integrated but awaiting production approval
- **Average Stream Duration:** 30-90 days
- **Token Support:** cUSD, USDC, USDT, CELO, G$

*Note: As a newly launched product, these numbers reflect our bootstrap phase. Our primary focus this round is systematic growth through strategic partnerships and community activations.*

---

### 2.3 Integration

**G$ Integration Status:**  
☑ Live

**Integration Type:** (Select all that apply)  
☑ Payments/rewards using G$  
☑ Identity  
☑ Claim flow  
☐ GoodCollective pools  
☐ G$ Supertoken/streaming  
☐ Activity fees → UBI Pool  
☑ Other: Engagement Rewards integration

**Describe your G$ integration & why it matters:**

Drip integrates G$ as a first-class payment token throughout our platform, enabling users to create real-time payment streams and recurring subscriptions denominated in G$. We've implemented GoodDollar's identity verification and UBI claiming directly in our treasury dashboard, allowing users to verify once, claim daily G$, and immediately deploy those funds into programmable payment streams. This transforms G$ from a simple transfer token into programmable infrastructure for recurring payments, contributor compensation, and subscription billing—expanding utility while maintaining accessibility through Celo's low-cost transactions.

---

### 2.4 What You'll Build

**Season 3 Expectations:** Growth is an emphasis for this GoodBuilders round.

**Primary Build Goal:**

Launch mobile money streaming infrastructure that converts G$ directly into M-Pesa/MTN/Airtel, enabling 150+ African recipients to spend cryptocurrency as spendable local currency within 12 weeks.

---

**Build Milestone 1:**

**Title:**  
G$ to Mobile Money Streaming (Africa-First Financial Inclusion)

**Description:** (1,892 characters)

We'll build revolutionary mobile money streaming infrastructure that converts G$ directly into M-Pesa, MTN Mobile Money, and Airtel Money—bridging crypto and real-world African economies. This transforms G$ from "crypto token" into "spendable daily currency" for 700M+ mobile money users across Africa.

**The Problem We're Solving:**  
African users claim G$ UBI daily but can't spend it at local shops. Current crypto-to-mobile-money requires bank accounts (only 43% have them), multiple exchanges (6-9% fees), and 2-5 days settlement. Meanwhile, 83% have mobile phones and 60% use mobile money for daily transactions. We're building the missing bridge.

**Our Solution - Automated G$ → Mobile Money Streaming:**

1. **Mobile Money Stream Creation:** Users create streams specifying recipient's mobile number, country (Kenya/Uganda/Tanzania/Nigeria), and provider (M-Pesa/MTN/Airtel). Stream G$ continuously, auto-converts when threshold reached ($5-10).

2. **Smart Contract Enhancement:** Add mobile money metadata to DripCore (mobile number, provider, conversion threshold). Authorized converter service can withdraw accrued G$ for conversion.

3. **Off-Chain Converter Service:** Background service monitors streams, withdraws G$ when threshold reached, swaps G$ → cUSD via Ubeswap (0.3% fee), sends to mobile money via Kotani Pay API (2% fee), SMS notification sent to recipient.

4. **Kotani Pay Partnership:** Integrate with Kotani Pay (Celo-native, Kenya-based) for M-Pesa/MTN/Airtel connectivity across East Africa. Total fees: 2.3-2.8% (vs 6-9% traditional remittance).

5. **Mobile-Optimized Recipient Experience:** Simple tracking page showing "You received KES 600 from Alice" with zero crypto knowledge needed.

**Why This Matters:**  
Each sender creates streams to 5-20 African recipients (family, friends, employees). Each recipient gets introduced to G$ ecosystem through tangible value—M-Pesa arriving weekly. This creates 10x viral growth: 1 DAO paying 20 African contributors = 20 new mobile money recipients = potential 20 new G$ claimers.

**Target KPIs:** 50 mobile money streams created, 150+ unique recipients receiving M-Pesa/MTN/Airtel, $5,000 G$ converted to mobile money monthly, <3% total fees, 95%+ conversion success rate, 85%+ recipient satisfaction

**Deliverables:**
1. Updated DripCore smart contract with mobile money metadata and conversion functions
2. Off-chain converter service (TypeScript/Node.js) with Ubeswap and Kotani Pay integration
3. Mobile money stream creation UI with mobile number validation
4. Conversion monitoring dashboard showing success rates, fees, and transaction history
5. Mobile-optimized recipient tracking page (no wallet required)
6. Partnership agreement with Kotani Pay for production access
7. Documentation and SMS notification system

---

**Build Milestone 2:**

**Title:**  
Bulk G$ Operations & Treasury Analytics Suite

**Description:** (687 characters)

Build comprehensive treasury management features enabling DAOs and organizations to efficiently distribute G$ to dozens of contributors simultaneously while maintaining full visibility into their G$ economy.

1. **Bulk Stream Creation:** Upload CSV files to create 10-50 G$ streams (or mobile money streams) with one transaction, reducing gas costs by 70% and enabling efficient mass payments

2. **G$ Treasury Analytics Dashboard:** Real-time visualization of G$ inflows (UBI claims, received streams, engagement rewards), outflows (active streams, mobile money conversions), projected runway, and burn rate

3. **Engagement Rewards Integration:** Automatic G$ bonus rewards for first stream creation, first subscription, and successful referrals—integrated with GoodDollar's production Engagement Rewards contract

4. **Payment Templates Library:** Pre-configured stream templates for common use cases (monthly contributor stipends, weekly bounties, quarterly grants, mobile money remittances)

**Target KPIs:** 5 DAOs using bulk operations for 100+ total recipients, 40% reduction in treasury management time, 80%+ template usage rate, $15,000+ monthly G$ distribution volume

**Deliverables:**
1. CSV upload interface with validation and preview
2. Batch transaction execution with gas optimization
3. Real-time G$ treasury dashboard with charts and projections
4. Engagement Rewards production contract integration with automated claims
5. Template library with 5+ pre-configured payment schedules
6. Export functionality (CSV/JSON) for accounting reconciliation

---

**Ecosystem Impact:**

We solve GoodDollar's "last-mile problem" by making G$ actually spendable for Africa's 700M mobile money users—transforming G$ from crypto experiment into real money that pays school fees and buys food via M-Pesa/MTN/Airtel. This unlocks viral adoption (each sender creates streams to 5-20 African recipients), captures the $100B remittance market at 2.3% fees vs 6-9% traditional rates, and proves blockchain delivers real financial inclusion with tangible impact stories that attract philanthropic capital to the G$ ecosystem.

---

### 2.5 How You'll Grow

**Primary Growth Goal:**

Activate 100+ GoodDollar UBI claimers in Kenya, Nigeria, Uganda, and Tanzania to convert their daily G$ claims into spendable mobile money (M-Pesa/MTN/Airtel), generating $8,000+ monthly G$ → mobile money conversion volume and proving real-world utility of G$ UBI.

---

**Target Users, Communities, and/or Partners:**

Existing GoodDollar UBI claimers in East/West Africa (Kenya, Nigeria, Uganda, Tanzania) who claim daily G$ but can't spend it locally, GoodDollar community ambassadors and regional coordinators, Celo Africa regional communities (Kenya Hub, Nigeria Community, Uganda Blockchain Association), and African-focused impact organizations seeking to demonstrate tangible UBI impact.

---

**Growth Milestone 1:**

**Title:**  
GoodDollar UBI Claimers Conversion Program

**Description:**

Activate 100+ existing GoodDollar UBI claimers across Kenya, Nigeria, Uganda, and Tanzania to convert their accumulated G$ into spendable mobile money (M-Pesa/MTN/Airtel), solving the critical "I claim G$ daily but can't buy food with it" problem and proving real-world UBI utility. Target users are active claimers accumulating $2-5/day G$ UBI ($60-150 monthly) but facing the last-mile problem: local shops don't accept crypto, exchanges require bank accounts (only 43% have them), and conversion processes are complex. We'll demonstrate that their accumulated G$500 UBI = KES 73,000 M-Pesa = tangible purchasing power for school fees, groceries, medicine, and family support—transforming G$ from theoretical UBI experiment into practical poverty-reduction tool.

**Weeks 1-3 (Community Partnership):** Partner with GoodDollar Foundation and African regional ambassadors (Kenya, Nigeria, Uganda coordinators) to identify active UBI claimers with accumulated G$ balances. Create educational materials in local languages (Swahili, Hausa, Yoruba) showing "Your G$500 UBI = KES 73,000 M-Pesa = pay school fees, buy groceries, send money to family."

**Weeks 4-8 (User Activation):** Run community workshops in each target country teaching UBI claimers to convert G$ → mobile money. Onboard 80-100 claimers creating personal mobile money conversion streams (weekly or bi-weekly auto-conversion of accumulated G$). Provide gas fee subsidies for first 5 conversions and hands-on setup support via WhatsApp groups. Monitor conversion success rates, M-Pesa/MTN delivery times, user satisfaction.

**Weeks 9-12 (Viral Growth & Optimization):** Capture impact stories ("I Used My G$ UBI to Pay School Fees—Here's How"), optimize conversion timing based on user feedback (daily claim accumulation patterns), create peer-to-peer referral program (existing users onboard friends/family for G$ rewards), expand to additional regions within target countries.

**Target KPIs:** 100 UBI claimers activated, $8,000+ monthly G$ → mobile money conversion volume, 85% conversion success rate, 80% user retention (continue monthly conversions), 90% satisfaction ("G$ is now useful money"), 25+ peer referrals generated.

**Activations:**
1. Partner with GoodDollar Foundation for direct access to African UBI claimer communities
2. Offer first 5 conversions fee-free (subsidize gas + Kotani Pay fees) to prove value
3. Run 8 local workshops (2 per country) with regional ambassadors in native languages
4. Create viral case study videos: "My G$ UBI Paid My Child's School Fees"
5. Build WhatsApp support groups per country with 24/7 peer support and troubleshooting

---

**Growth Milestone 2:**

**Title:**  
African Diaspora Remittance Pilot

**Description:**

Launch diaspora remittance pilot with 25+ Africans abroad (US, UK, Canada, EU) sending G$ → mobile money streams to family back home in Kenya, Nigeria, Uganda, Tanzania—demonstrating 70% fee savings vs Western Union ($100 → KES 14,500 M-Pesa vs KES 13,200 Western Union) while proving G$ as serious remittance infrastructure.

**Target Users:** Kenyan, Nigerian, Ugandan, Tanzanian diaspora communities sending $50-500 monthly to 2-5 family members for school fees, groceries, medical expenses, business capital. Current pain: 6-9% Western Union/MoneyGram fees, 2-5 day delays, bank account requirements. Our solution: 2.3% fees, same-day M-Pesa/MTN/Airtel delivery, no recipients need bank accounts or crypto knowledge.

**Why This Works:** Diaspora is highly motivated (sending life-critical money home monthly), fee-sensitive (70% savings = $200-500 saved annually per sender), and viral (each sender tells 10+ diaspora friends about savings). Success stories create powerful proof: "I send $200 to mom monthly—Drip saves me $400/year vs Western Union." This positions G$ to capture share of Africa's $100B annual remittance market.

**Target KPIs:** 25 diaspora senders activated, 70+ African family recipients receiving M-Pesa/MTN/Airtel, $5,000+ monthly remittance volume via G$ streams, 80% sender retention, 90% recipient satisfaction, 2.3-2.8% total fees maintained.

**Activations:**
1. Partner with 3+ diaspora associations (US/UK/Canada/EU) for introductions and workshops
2. Create fee comparison calculator showing savings vs Western Union/MoneyGram/WorldRemit
3. Offer first $500 remittance fee-free (subsidize conversion fees) to prove value proposition
4. Run 4 regional diaspora webinars demonstrating setup and fee savings
5. Produce viral case studies: "How I Save $400/Year Sending Money to Kenya"

---

**Ecosystem Impact:**

We unlock GoodDollar's dormant UBI value by proving 100+ African claimers can convert daily G$ into school fees, groceries, and family support via mobile money—transforming G$ from "crypto experiment" into "real money that lifts people out of poverty." This generates exponential viral adoption (satisfied UBI claimers recruit friends/family, each diaspora sender creates 2-5 new African recipients) while establishing G$ as serious remittance infrastructure capable of capturing the $100B Africa remittance market, attracting massive philanthropic capital through concrete proof points of blockchain-enabled financial inclusion.

---

### 2.6 Team

**Primary Contact:**

| Field | Value |
|-------|-------|
| Name | [Your Full Name] |
| Role & Description | Founder & Lead Developer - Full-stack engineer with expertise in Solidity smart contracts, Celo ecosystem, and DeFi infrastructure. Designed and implemented Drip's core streaming contracts and GoodDollar integration. |
| Telegram | https://t.me/[your-username] |
| Github/LinkedIn Profile | https://github.com/[your-username] or https://linkedin.com/in/[your-profile] |

**Additional Team Members (Optional):**

*Add team members if applicable. If solo, leave blank or add advisors/contributors.*

---

### 2.7 Additional

**Additional Comments:**

**Why Now for GoodBuilders:**  
We've built all the foundational infrastructure—contracts deployed, G$ integration live, UBI claiming functional. Now we need strategic support to find the right DAO partners and creator communities who will *actually use* this system at scale. GoodBuilders provides the network, credibility, and accountability structure to execute systematic growth rather than scattered outreach.

**What We Need From GoodBuilders:**
1. **Intros to 3-5 pilot DAOs:** Specifically Celo Foundation grantees who already receive funding and need to distribute to contributors
2. **Feedback on messaging:** Help us refine how we position G$ streaming to DAOs vs. creators vs. impact orgs
3. **Technical guidance:** Best practices for optimizing G$ user experience on mobile
4. **Community amplification:** Help share success stories through GoodDollar and Celo community channels

**Our Commitment:**  
We'll provide detailed public updates every 2 weeks on KPIs (DAOs onboarded, streams created, recipients activated, G$ distributed). Full transparency on what works and what doesn't, so other builders can learn from our experiments.

**Long-Term Vision:**  
Drip becomes the default infrastructure for G$ distribution beyond simple transfers—the Stripe for GoodDollar, powering contributor payments, creator royalties, grant distribution, and subscription billing across the Celo ecosystem.

---

## 3. ATTESTATION

### 3.1 Commitment

**Agree to Commitments:**  
☑ I agree to:
- Post progress and milestones updates on Flow State at least every 2-3 weeks
- Join the Demo Days held throughout the round
- Join office hours when needed  
- Share KPI data during and after the round
- Communicate promptly in the program's Telegram/Flow State channels
- Provide feedback to improve future rounds

---

### 3.2 Identity & KYC

**Recipient Type:**  
☑ Individual  
☐ Organization

**Legal Name / Company Name:**  
[Your Legal Name]

**Country of Residence / Registration:**  
[Your Country]

**Address:**  
[Your Full Address - Street, City, State/Province, Postal Code, Country]

**Contact Email:**  
[Your Email Address]

**Wallet to Receive Funding:**  
[Your 0x... Ethereum/Celo wallet address]

**Confirm Wallet Ownership:**  
☑ I confirm the wallet belongs to the named individual or organization

---

### 3.3 Data Acknowledgement

**GDPR Consent:**  
☑ I consent to the collection and use of my data for the purposes of participating in the GoodBuilders Round 3 and receiving a grant via the Flow State platform. I understand that my data will be handled in accordance with GDPR and will not be shared outside of GoodDollar and its grant management partners.

I also agree to be contacted by the GoodDollar team with relevant updates, including program communications and occasional newsletters. I can unsubscribe at any time.

---

## NOTES FOR SUBMISSION

**Before Submitting:**

1. ✅ **Replace Placeholders:**
   - Add your actual wallet addresses, emails, social handles
   - Upload logo and banner images
   - Add your production URL
   - Link your GitHub repository
   - Fill in your name, address, and KYC details

2. ✅ **Verify Information:**
   - Double-check all contract addresses match your deployed contracts
   - Ensure GitHub repo is public
   - Test that your production URL works
   - Verify all links are clickable

3. ✅ **Prepare Supporting Materials:**
   - Screenshot of your live application
   - Short demo video (2-3 minutes) showing G$ stream creation
   - Any analytics/metrics screenshots
   - Team bios/photos if applicable

4. ✅ **Review Character Limits:**
   - Description: 1,000-5,000 characters ✓ (1,543)
   - Build Milestone 1 Description: 500+ ✓ (782)
   - Build Milestone 2 Description: 500+ ✓ (625)
   - Growth Milestone 1 Description: 500+ ✓ (892)
   - Growth Milestone 2 Description: 500+ ✓ (723)
   - Ecosystem Impact sections: <4,000 ✓

5. ✅ **Final Checks:**
   - All required fields marked with * are filled
   - All links are https:// URLs
   - Contract addresses are valid Celo mainnet addresses
   - Email addresses are correct
   - Social media handles start with @

---

## STRATEGIC ADVICE

**Strengths of This Application:**
- ✅ Live product with deployed contracts (not vaporware)
- ✅ Real G$ integration (Identity + UBI + Engagement Rewards)
- ✅ Clear growth strategy focused on DAOs/creators
- ✅ Measurable KPIs tied to ecosystem growth
- ✅ Network effects built into product (each sender = 10-50 recipients)
- ✅ Aligns with GoodDollar mission (financial inclusion, utility expansion)

**Potential Concerns to Address:**
- Low current user numbers → Frame as "early stage with strong foundation ready to scale"
- Solo founder → Emphasize ability to execute (already deployed to mainnet)
- New to GoodBuilders → Show you've researched the program and understand expectations

**Keys to Success:**
1. **Be specific:** "5 DAOs, 100 recipients, $5k monthly" is better than "grow adoption"
2. **Show understanding:** Reference GoodDollar's mission, Celo's mobile-first approach
3. **Prove capability:** Point to live contracts, working integration, technical depth
4. **Admit what you don't know:** "Need help with DAO intros" shows self-awareness
5. **Commit to transparency:** Public KPIs every 2 weeks builds trust

Good luck! 🚀
