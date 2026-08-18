import { promises } from "dns";
import { connectDatabase } from "../config/database.js";
import { Opportunity } from "../modules/opportunities/opportunity.model.js";

async function createTestOpportunity(): Promise<void> {
    await connectDatabase();

    const opportunity = await Opportunity.create({
        title: "FindOp Test Hackathon",
        organization: "FindOp",
        description: "A test opportunity create during backend development",
        category: "hackathon",
        url: "https://example.com/findop-test",
        source: "manual-test",
        location: "Remote",
        eligibility: "Developer and Students",
        skills: ["Javascript", "NodeJS", "MongoDB"],
    });

    console.log("Opportunity Created: ")
    console.log(opportunity);

    process.exit(0);

}

createTestOpportunity().catch((error: unknown) => {
    console.error("Failed to create Opportunity :", error);
    process.exit(1)
})