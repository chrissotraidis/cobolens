       01  CUSTOMER-RECORD.
           05 CUSTOMER-ID        PIC X(10).
           05 CUSTOMER-NAME      PIC X(30).
           05 ACCOUNT-BALANCE    PIC S9(7)V99 COMP-3.
           05 ACCOUNT-STATUS     PIC X.
              88 ACCOUNT-ACTIVE  VALUE 'A'.
              88 ACCOUNT-CLOSED  VALUE 'C'.

