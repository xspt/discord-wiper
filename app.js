const token = ""; // YOUR TOKEN
const authorId = ""; // YOUR USER ID
const channelId = ""; // CHANNEL ID (If it is a guild channel id, the script will delete all your messages from that guild)

const apiUri = "https://discord.com/api/v9";
const headers = {
   "Authorization": token,
};


(async () => {
   let guildId = undefined;

   const req = await GetChannel(channelId);
   const data = await req.json();

   // It is a guild channel
   if (data["type"] === 0) {
      guildId = data["guild_id"];
   }

   let searchDelay = 1500;
   let deleteDelay = 500;
   let total = undefined;
   let deleted = 0;
   let limited = 0;
   let offset = 0;
   let sort = "desc";
   do {
      console.log("Fetching messages\n");
      const search = await SearchChannel(channelId, authorId, guildId, sort, offset);

      // Rate limited
      // https://discord.com/developers/docs/topics/rate-limits#exceeding-a-rate-limit
      if (search.status === 429) {
         searchDelay = (await search.json())["retry_after"] * 1000;
         console.log(`Rate limited: trying again in ${deleteDelay}ms\n`);
         await Sleep(searchDelay * 2);
         continue;
      } else if (!req.ok) {
         console.log(req.status, req.statusText);
         await Sleep(searchDelay * 2);
         continue;
      }

      // Alternate between ascending and descending order when searching to prevent deleting messages that already have been deleted
      // Search indexing may have not caught up
      sort = (sort === "desc") ? "asc" : "desc";

      const data = await search.json();

      total = (total === undefined) ? data["total_results"] : total;

      if (data["messages"].length < 1) {
         offset += 25;
         console.log(`Got empty response, trying with offset ${offset}\n`);
         await Sleep(searchDelay);
         continue;
      }

      for (let message of data["messages"]) {
         // Only try to delete messages that are deletable
         // https://discord.com/developers/docs/resources/message#message-object-message-types
         if (message[0]["type"] === 0 || message[0]["type"] === 19 || message[0]["type"] === 20) {
            let tries = 0;

            deleteLoop:
            while (true) {
               const req = await DeleteMessage(message[0]["channel_id"], message[0]["id"]);

               if (req.status === 429) { // Rate limited
                  deleteDelay = (await req.json())["retry_after"] * 1000;
                  limited++;
                  console.log(`Rate limited: trying again in ${deleteDelay}ms\n`);
                  await Sleep(deleteDelay * 3);
                  continue deleteLoop;
               } else if (!req.ok) { // Something else
                     console.log(req.status, req.statusText);
                  tries++;
                  console.log(`Tries: ${tries}`);
                  await Sleep(deleteDelay);
                  continue deleteLoop;
               }

               if (tries > 2) {
                  console.log("Exceeded tries, skiping to next message\n");
                  break deleteLoop;
               }

               deleted++;
               console.log(`Deleted: ${message[0]["content"]}`);
               console.log(`Already deleted: ${deleted} messages\n`);
               if (deleteDelay < 750) deleteDelay = 750;
               await Sleep(deleteDelay);
               break deleteLoop;
            }
         } else {
            console.log("Result wasn't a text message, skipping\n");
            deleted++;
         }

         offset = 0;
         if (limited > 10) {
            limited = 0;
            console.log("Sleeping for 15s to avoid rate limit\n");
            await Sleep(15000);
         }
      }

      await Sleep(searchDelay);

   } while (deleted < total);
})();


async function DeleteMessage(channelId, messageId) {
   const req = await fetch(`${apiUri}/channels/${channelId}/messages/${messageId}`, {
      method: "DELETE",
      headers: headers,
   });

   return req;
}


async function SearchChannel(channelId, authorId, guildId = undefined, sort = "desc", offset = 0) {
   const endpoint = guildId ? `${apiUri}/guilds/${guildId}/messages/search?author_id=${authorId}&sort_by=timestamp&sort_order=${sort}&offset=${offset}` :  `${apiUri}/channels/${channelId}/messages/search?author_id=${authorId}&sort_by=timestamp&sort_order=${sort}&offset=${offset}`;

   const req = await fetch(endpoint, {
      headers: headers,
   });

   return req;
}


async function GetChannel(channelId) {
   const req = await fetch(`${apiUri}/channels/${channelId}`, {
      headers: headers,
   });

   return req;
}


function Sleep(ms) {
   return new Promise((resolve) => {
      setTimeout(resolve, ms);
   });
}
