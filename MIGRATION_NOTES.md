# Migration Notes

## Unreleased

Changes to AuthWitness creation:

```diff
  pool.methods.swap(
    amountIn,
    amountOut,
    {
      authWitnesses: [
        usdc.methods.transfer(
          alice.getAddress(),
          pool.address,
          10,
-       ).request(),
+       ),
      ],
    },
  );
```
