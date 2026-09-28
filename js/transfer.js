// ==================================================
// Receipt confirmation data
// ==================================================

try {

  const rawMyPendingConfirmations =
    await getMyPendingConfirmations({
      db,
      currentUser
    });

  myPendingConfirmations =
    rawMyPendingConfirmations
      .map(receipt =>
        attachPendingReminderInfo(
          receipt
        )
      )
      .sort((a, b) => {

        const dateA =
          String(
            a.purchaseDate || ''
          );

        const dateB =
          String(
            b.purchaseDate || ''
          );

        if (!dateA && !dateB) {
          return 0;
        }

        if (!dateA) {
          return 1;
        }

        if (!dateB) {
          return -1;
        }

        return dateA.localeCompare(
          dateB
        );
      });


  if (isOwner) {

    allPendingConfirmations =
      await getAllPendingReceipts({
        db
      });

    unresolvedMismatches =
      await getUnresolvedMismatches({
        db
      });
  }

} catch (error) {

  console.error(
    'Failed to load dashboard receipt data:',
    error
  );
}


// ==================================================
// Transfer data
// ==================================================

try {

  myPendingTransfers =
    await getMyPendingTransfers({
      db,
      currentUser
    });

  console.log(
    'Dashboard pending transfers:',
    myPendingTransfers
  );


  myReceivedTransferUpdates =
    await getMyReceivedTransferUpdates({
      db,
      currentUser
    });

  console.log(
    'Dashboard transfer updates:',
    myReceivedTransferUpdates
  );

} catch (error) {

  console.error(
    'Failed to load dashboard transfer data:',
    error
  );
}
