import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { describeMailerConfig } from "./modules/auth/mailer.js";
import { IndexScheduler, defaultSchedulerDependencies } from "./scheduler/index.scheduler.js";

async function bootstrap(): Promise<void> {
  await connectDatabase();

  console.log(`Mail delivery: ${describeMailerConfig()}`);

  if (env.SCHEDULER_ENABLED) {
    const scheduler = new IndexScheduler(defaultSchedulerDependencies());
    scheduler.start();
    // Kick one immediate pass so due sources start refreshing at boot.
    void scheduler.tick().catch(() => undefined);
    console.log("Opportunity index scheduler started");
  } else {
    console.log("Opportunity index scheduler disabled");
  }

  app.listen(env.PORT, () => {
    console.log(`FindOP backend running on port ${env.PORT}`);
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
